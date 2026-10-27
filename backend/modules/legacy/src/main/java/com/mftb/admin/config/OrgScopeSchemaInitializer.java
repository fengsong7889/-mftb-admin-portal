package com.mftb.admin.config;

import com.mftb.admin.config.migration.SchemaPhase;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 组织数据权限（数据范围）结构迁移：sys_role 补 data_scope 列 + 建 sys_role_dept 表。
 * <p>
 * 必须早于 {@link PasswordPolicySchemaInitializer}（@Order(3)）与 {@link DataInitializer}（@Order(5)）：
 * {@code SysRole} 实体已带 dataScope 字段，MyBatis-Plus 生成的显式列清单会 SELECT 它，
 * 列未就绪时任何角色查询（含启动期的超管角色查找、授权中心菜单初始化器）都会报
 * Unknown column 并引发启动失败/重启循环。契约校验器（SchemaContractValidator）排在所有
 * 初始化器之后，只作为第二道闸，不能指望它救启动期查询。
 * <p>
 * 参考 SQL: {@code backend/sql/245_org_data_scope.sql}（一次性文档）。
 * 设计口径: docs/design/员工管理_Core_HR_整改方案_94e06fc1.md §10.9。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(2)
public class OrgScopeSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "iam:org-scope:v1.0";

    /** 角色表名（与 ContractRegistry 契约同构） */
    public static final String ROLE_TABLE = "sys_role";
    /** 角色-自定部门关联表名 */
    public static final String ROLE_DEPT_TABLE = "sys_role_dept";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    /** 阶段：BASE_STRUCTURE —— sys_* 核心表补列，早于任何业务模块结构。 */
    @SuppressWarnings("unused")
    private static final SchemaPhase PHASE = SchemaPhase.BASE_STRUCTURE;

    @Override
    public void run(String... args) {
        // 不吞异常：缺列会让全部角色查询报错，applyOnce 校验不过就不记版本，下次启动重试
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        Integer colExists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'data_scope'",
                Integer.class, ROLE_TABLE);
        if (colExists == null || colExists == 0) {
            // 不能写 AFTER permissions：本初始化器 @Order(2) 早于 DataInitializer(@Order 5)，
            // 全新库此时 sys_role 还没有 permissions 列，引用它会让空库启动直接失败。
            jdbcTemplate.execute("ALTER TABLE " + ROLE_TABLE
                    + " ADD COLUMN data_scope TINYINT NOT NULL DEFAULT 1"
                    + " COMMENT '数据范围: 1仅本人 2本部门 3本部门及以下 4自定部门 5全部'");
        }
        // 存量角色统一落 1（仅本人，严格模式）：DEFAULT 已覆盖新列，但 MySQL 加带默认值的列
        // 历史行本就取默认值，这里显式收敛一次以兼容「先手工加过列、值为 NULL」的漂移库。
        jdbcTemplate.update("UPDATE " + ROLE_TABLE + " SET data_scope = 1 WHERE data_scope IS NULL");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + ROLE_DEPT_TABLE + " ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "role_id BIGINT NOT NULL COMMENT '角色ID(sys_role.id)', "
                        + "dept_id BIGINT NOT NULL COMMENT '部门ID(sys_department.id)', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间', "
                        + "UNIQUE KEY uk_role_dept (role_id, dept_id), "
                        + "KEY idx_role_dept_role (role_id)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-自定部门数据范围关联表'");
        log.info("组织数据权限结构已就绪: {}.data_scope + {}", ROLE_TABLE, ROLE_DEPT_TABLE);
    }

    private void verifyMigration() {
        Integer col = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'data_scope'",
                Integer.class, ROLE_TABLE);
        if (col == null || col == 0) {
            throw new IllegalStateException(ROLE_TABLE + ".data_scope 列未就绪");
        }
        Integer nullable = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'data_scope' "
                        + "AND IS_NULLABLE = 'NO'",
                Integer.class, ROLE_TABLE);
        if (nullable == null || nullable == 0) {
            throw new IllegalStateException(ROLE_TABLE + ".data_scope 必须 NOT NULL（否则解析端要处理三态）");
        }
        Integer tbl = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, ROLE_DEPT_TABLE);
        if (tbl == null || tbl == 0) {
            throw new IllegalStateException(ROLE_DEPT_TABLE + " 表未创建成功");
        }
        Integer uk = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_role_dept'",
                Integer.class, ROLE_DEPT_TABLE);
        if (uk == null || uk == 0) {
            throw new IllegalStateException(ROLE_DEPT_TABLE + " 缺唯一键 uk_role_dept（重复授权行会让范围解析翻倍）");
        }
    }
}

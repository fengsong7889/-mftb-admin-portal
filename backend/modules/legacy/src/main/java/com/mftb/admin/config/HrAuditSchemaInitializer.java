package com.mftb.admin.config;

import com.mftb.admin.constant.HrAuditAction;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 人事操作审计结构迁移（方案 §5.5 新增人事操作审计、§7.4 审计字段要求）。
 * <p>
 * 只建表、不迁数据：旧的「员工动态」是登录日志、详情页的「最后更新」是 localStorage 时间戳，
 * 两者都不是人事审计事实（§5.5 明令「不能用登录日志或 localStorage 更新时间代替」），
 * 把它们搬进审计表等于伪造一份看起来完整的审计史。
 * <p>
 * 执行时机：@Order(33)，与业务域结构同批、晚于菜单种子。参考 SQL：{@code backend/sql/249_hr_operation_audit.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(33)
public class HrAuditSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:audit-schema:v1.0";

    private static final String TABLE_NAME = "hr_operation_audit";
    private static final String ACTION_CHECK = "ck_hr_audit_action";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("人事操作审计结构迁移失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + TABLE_NAME + " ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "user_id BIGINT NOT NULL COMMENT '被操作员工ID(sys_user.id)', "
                        + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '员工工号快照', "
                        + "action VARCHAR(32) NOT NULL COMMENT '动作: EMPLOYEE_UPDATE/SENSITIVE_VIEW/POSITION_WRITE 等', "
                        + "field_name VARCHAR(64) DEFAULT NULL COMMENT '变更字段名，动作级留痕为 NULL', "
                        + "before_value VARCHAR(500) DEFAULT NULL COMMENT '变更前值（敏感字段写入时已脱敏）', "
                        + "after_value VARCHAR(500) DEFAULT NULL COMMENT '变更后值（敏感字段写入时已脱敏）', "
                        + "detail VARCHAR(500) DEFAULT NULL COMMENT '动作补充说明', "
                        + "reason VARCHAR(255) DEFAULT NULL COMMENT '原因', "
                        + "source_req_no VARCHAR(32) DEFAULT NULL COMMENT '来源人事单据号', "
                        + "effective_date DATE DEFAULT NULL COMMENT '业务生效日（与发生时间分开）', "
                        // sensitive 是 MySQL 8 保留字（索引敏感度），必须反引号；实体侧同步用 @TableField("`sensitive`")
                        + "`sensitive` TINYINT NOT NULL DEFAULT 0 COMMENT '是否涉及敏感面: 1是 0否', "
                        + "operator VARCHAR(64) DEFAULT NULL COMMENT '操作人快照', "
                        + "occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间', "
                        + "KEY idx_hr_audit_user (user_id, occurred_at), "
                        + "KEY idx_hr_audit_action (action, occurred_at), "
                        + "KEY idx_hr_audit_operator (operator, occurred_at)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人事操作审计（只增不改，无软删列）'");
        addActionCheck();
        log.info("人事操作审计表已就绪: {}", TABLE_NAME);
    }

    /** CHECK 与 {@link HrAuditAction#ALL_ACTIONS} 同源：写错动作码在落库那一刻就被拦住，而不是等到界面翻译不出来 */
    private void addActionCheck() {
        Integer constrained = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?",
                Integer.class, TABLE_NAME, ACTION_CHECK);
        if (constrained != null && constrained > 0) {
            return;
        }
        List<String> quoted = new ArrayList<>();
        for (String action : HrAuditAction.ALL_ACTIONS) {
            quoted.add("'" + action + "'");
        }
        jdbcTemplate.execute("ALTER TABLE " + TABLE_NAME + " ADD CONSTRAINT " + ACTION_CHECK
                + " CHECK (action IN (" + String.join(",", quoted) + "))");
    }

    private void verify() {
        if (jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, TABLE_NAME) == 0) {
            throw new IllegalStateException(TABLE_NAME + " 表未创建成功");
        }
        // 三个查询入口（按人、按动作、按操作人）都靠这些索引，缺一个就是全表扫
        for (String index : List.of("idx_hr_audit_user", "idx_hr_audit_action", "idx_hr_audit_operator")) {
            Integer found = jdbcTemplate.queryForObject(
                    "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                    Integer.class, TABLE_NAME, index);
            if (found == null || found == 0) {
                throw new IllegalStateException(TABLE_NAME + " 缺索引 " + index);
            }
        }
        Integer check = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?",
                Integer.class, TABLE_NAME, ACTION_CHECK);
        if (check == null || check == 0) {
            throw new IllegalStateException(TABLE_NAME + " 缺 CHECK 约束 " + ACTION_CHECK);
        }
    }
}

package com.mftb.admin.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 数据初始化器: 启动时自动执行字段迁移与内置账号迁移, 并将 SQL 中的占位密码重置为正确的 BCrypt 加密值
 * <p>
 * 登录账号统一为工号, 工号按 MT 前缀自增(MT0001 起), 内置管理员工号 MT0001, 密码: 111222
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        migrateSchema();
        migrateBuiltinAccounts();
        migrateEmpIdToMT();
        resetPasswordIfNeeded("MT0001", "111222");
    }

    /** 内置账号迁移: 登录账号统一为工号, 移除 guest 账号 (旧库 admin 账号由 migrateEmpIdToMT 统一重编号) */
    private void migrateBuiltinAccounts() {
        int removed = jdbcTemplate.update("DELETE FROM sys_user WHERE username = 'guest'");
        if (removed > 0) {
            log.info("已移除内置 guest 账号");
        }
    }

    /**
     * 存量工号迁移: 将所有非 MT 格式登录账号的员工(含逻辑删除记录)按 id 升序重编号为 MT0001+,
     * 登录账号与工号同步更新; 已是 MT 格式的记录不变, 重复启动幂等
     */
    private void migrateEmpIdToMT() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_user WHERE username NOT REGEXP '^MT[0-9]+$' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(username, 3) AS UNSIGNED)), 0) FROM sys_user "
                        + "WHERE username REGEXP '^MT[0-9]+$'",
                Integer.class);
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            String empId = String.format("MT%04d", ++seq);
            jdbcTemplate.update("UPDATE sys_user SET username = ?, emp_id = ? WHERE id = ?", empId, empId, id);
        }
        log.info("已将 {} 个存量员工工号迁移为 MT 自增格式", ids.size());
    }

    /** 幂等字段迁移: 列不存在时自动 ALTER TABLE (免手动执行 SQL 脚本) */
    private void migrateSchema() {
        addColumnIfAbsent("sys_user", "function_roles",
                "ALTER TABLE sys_user ADD COLUMN function_roles TEXT NULL COMMENT '绑定的功能角色ID JSON数组' AFTER role");
        addColumnIfAbsent("sys_role", "permissions",
                "ALTER TABLE sys_role ADD COLUMN permissions TEXT NULL COMMENT '菜单权限 JSON数组' AFTER description");
        addColumnIfAbsent("sys_user", "department_id",
                "ALTER TABLE sys_user ADD COLUMN department_id BIGINT NULL COMMENT '所在部门ID' AFTER function_roles");
        addColumnIfAbsent("sys_role", "updated_by",
                "ALTER TABLE sys_role ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        createDepartmentTableIfAbsent();
        addColumnIfAbsent("sys_department", "updated_by",
                "ALTER TABLE sys_department ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER sort");
        createPositionTableIfAbsent();
        addColumnIfAbsent("sys_position", "name_en",
                "ALTER TABLE sys_position ADD COLUMN name_en VARCHAR(128) NULL COMMENT '职位英文名称' AFTER name");
        addColumnIfAbsent("sys_position", "rank",
                "ALTER TABLE sys_position ADD COLUMN `rank` VARCHAR(8) NULL COMMENT '职等 R1~R5' AFTER job_level");
        addColumnIfAbsent("sys_user", "position_id",
                "ALTER TABLE sys_user ADD COLUMN position_id BIGINT NULL COMMENT '职位ID' AFTER department");
        addColumnIfAbsent("sys_user", "job_level",
                "ALTER TABLE sys_user ADD COLUMN job_level VARCHAR(32) NULL COMMENT '职级快照' AFTER position");
        addColumnIfAbsent("sys_user", "position_en",
                "ALTER TABLE sys_user ADD COLUMN position_en VARCHAR(128) NULL COMMENT '职位英文名称快照' AFTER position");
        addColumnIfAbsent("sys_user", "sequence",
                "ALTER TABLE sys_user ADD COLUMN sequence VARCHAR(8) NULL COMMENT '职级序列快照: M=管理 T=技术 P=专业' AFTER position_en");
        addColumnIfAbsent("sys_user", "rank",
                "ALTER TABLE sys_user ADD COLUMN `rank` VARCHAR(8) NULL COMMENT '职等 R1~R5' AFTER job_level");
        backfillUserPositionEn();
        backfillUserSequence();
    }

    /** 回填存量员工的职级序列快照 (仅处理空值, 可重复执行) */
    private void backfillUserSequence() {
        int filled = jdbcTemplate.update(
                "UPDATE sys_user u JOIN sys_position p ON u.position_id = p.id "
                        + "SET u.sequence = p.sequence "
                        + "WHERE u.sequence IS NULL");
        if (filled > 0) {
            log.info("已回填 {} 名员工的职级序列快照", filled);
        }
    }

    /** 回填存量员工的职位英文名称快照 (仅处理空值, 可重复执行) */
    private void backfillUserPositionEn() {
        int filled = jdbcTemplate.update(
                "UPDATE sys_user u JOIN sys_position p ON u.position_id = p.id "
                        + "SET u.position_en = p.name_en "
                        + "WHERE u.position_en IS NULL AND p.name_en IS NOT NULL");
        if (filled > 0) {
            log.info("已回填 {} 名员工的职位英文名称快照", filled);
        }
    }

    /** 集团人事-职位表不存在时自动创建 */
    private void createPositionTableIfAbsent() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_position'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_position ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                        + "name VARCHAR(128) NOT NULL COMMENT '职位名称', "
                        + "name_en VARCHAR(128) NULL COMMENT '职位英文名称', "
                        + "sequence VARCHAR(8) NOT NULL COMMENT '职级序列: M=管理 T=技术 P=专业', "
                        + "job_level VARCHAR(32) NOT NULL COMMENT '职级', "
                        + "`rank` VARCHAR(8) NULL COMMENT '职等 R1~R5', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        + ") COMMENT='集团人事-职位表'");
        log.info("已自动创建职位表 sys_position");
    }

    /** 组织架构-部门表不存在时自动创建 */
    private void createDepartmentTableIfAbsent() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_department'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_department ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                        + "code VARCHAR(64) NOT NULL COMMENT '部门编码', "
                        + "name VARCHAR(128) NOT NULL COMMENT '部门名称', "
                        + "parent_id BIGINT NULL COMMENT '上级部门ID', "
                        + "leader VARCHAR(64) NULL COMMENT '部门对接人', "
                        + "permissions TEXT NULL COMMENT '部门授权菜单权限 JSON数组', "
                        + "status INT DEFAULT 1 COMMENT '状态: 1=有效 0=无效', "
                        + "sort INT DEFAULT 0 COMMENT '排序', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        + ") COMMENT='集团组织架构-部门表'");
        log.info("已自动创建部门表 sys_department");
    }

    private void addColumnIfAbsent(String table, String column, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已自动迁移字段 {}.{}", table, column);
        }
    }

    /** 若密码非合法 BCrypt 值(如 SQL 占位符), 则重置为默认密码的加密值 */
    private void resetPasswordIfNeeded(String username, String rawPassword) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (user == null) {
            return;
        }
        String pwd = user.getPassword();
        boolean validBcrypt = pwd != null && pwd.startsWith("$2") && pwd.length() >= 60;
        if (!validBcrypt) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            sysUserMapper.updateById(user);
            log.info("已初始化用户 [{}] 的默认密码", username);
        }
    }
}

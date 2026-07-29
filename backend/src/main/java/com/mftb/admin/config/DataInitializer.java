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

/**
 * 数据初始化器: 启动时自动执行字段迁移与内置账号迁移, 并将 SQL 中的占位密码重置为正确的 BCrypt 加密值
 * <p>
 * 登录账号统一为工号, 内置管理员工号 SF0001, 密码: 111222
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
        resetPasswordIfNeeded("SF0001", "111222");
    }

    /** 内置账号迁移: 登录账号统一为工号, admin 改用工号 SF0001 登录, 移除 guest 账号 */
    private void migrateBuiltinAccounts() {
        int renamed = jdbcTemplate.update(
                "UPDATE sys_user SET username = 'SF0001' WHERE username = 'admin'");
        if (renamed > 0) {
            log.info("已将内置 admin 账号登录名迁移为工号 SF0001");
        }
        int removed = jdbcTemplate.update("DELETE FROM sys_user WHERE username = 'guest'");
        if (removed > 0) {
            log.info("已移除内置 guest 账号");
        }
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

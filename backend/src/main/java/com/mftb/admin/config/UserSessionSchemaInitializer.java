package com.mftb.admin.config;

import com.mftb.admin.config.migration.SchemaPhase;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 空库基座自愈：补齐 {@code sys_user} 的部门英文快照、最后活跃时间、单设备会话与强制下线列。
 *
 * <p>{@code backend/sql/01_init_system.sql} 是旧版基座，缺少这些后加的列；
 * 而 {@code SysUser} 实体按显式列清单查询，缺任意一列都会让首次角色/账号查询失败。
 * 本初始化器必须在所有 {@code sys_user} 实体查询之前执行，因此取 {@code @Order(1)}。
 *
 * <p>只补列、不改数据；列已存在时跳过，可重复启动。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(1)
public class UserSessionSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "core:user-session-columns-v1.0";

    /** 列名与 DDL；不写 AFTER，避免依赖本类之后才补的列（如 quick_favorites 依赖 force_logout_reason）。 */
    private static final String[][] COLUMNS = {
            {"department_en", "ALTER TABLE sys_user ADD COLUMN department_en VARCHAR(100) NULL "
                    + "COMMENT '所在部门英文名称快照'"},
            {"last_active_at", "ALTER TABLE sys_user ADD COLUMN last_active_at DATETIME NULL "
                    + "COMMENT '最后活跃时间（空闲超时检测用）'"},
            {"active_token", "ALTER TABLE sys_user ADD COLUMN active_token VARCHAR(512) NULL "
                    + "COMMENT '当前活跃JWT Token（单设备登录校验）'"},
            {"active_login_ip", "ALTER TABLE sys_user ADD COLUMN active_login_ip VARCHAR(45) NULL "
                    + "COMMENT '当前活跃设备登录IP（单设备登录校验时返回给旧设备）'"},
            {"force_logout_operator", "ALTER TABLE sys_user ADD COLUMN force_logout_operator VARCHAR(64) NULL "
                    + "COMMENT '强制下线操作人姓名'"},
            {"force_logout_emp_id", "ALTER TABLE sys_user ADD COLUMN force_logout_emp_id VARCHAR(32) NULL "
                    + "COMMENT '强制下线操作人工号'"},
            {"force_logout_reason", "ALTER TABLE sys_user ADD COLUMN force_logout_reason VARCHAR(32) NULL "
                    + "COMMENT '强制下线原因: operator=管理员操作, account_disabled=账号被停用'"}
    };

    @SuppressWarnings("unused")
    private static final SchemaPhase PHASE = SchemaPhase.BASE_STRUCTURE;

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        for (String[] column : COLUMNS) {
            if (exists(column[0])) continue;
            jdbcTemplate.execute(column[1]);
        }
        log.info("sys_user 基座会话/快照列已就绪: {}", COLUMNS.length);
    }

    private void verify() {
        for (String[] column : COLUMNS) {
            if (!exists(column[0])) throw new IllegalStateException("sys_user." + column[0] + " 列未就绪");
        }
    }

    private boolean exists(String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sys_user' AND COLUMN_NAME=?",
                Integer.class, column);
        return count != null && count > 0;
    }
}

package com.mftb.admin.config;

import com.mftb.admin.config.migration.SchemaPhase;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 授权变更审计表初始化（权限中心重构 · 统一授权中心）。
 * <p>建 {@code sys_permission_audit_log} 表：记录谁、何时、对哪个目标（角色/部门）
 * 的哪个系统做了什么授权变更，含变更前后快照 JSON。
 * <p>参考 SQL: {@code backend/sql/194_authz_center.sql}（一次性文档）。
 * 结构契约见 {@code ContractRegistry#permAuditLogContract()}（每次启动自愈）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(19)
public class PermissionAuditSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "iam:perm-audit-table:v1.0";
    /** 表名（与 ContractRegistry 契约同构） */
    public static final String TABLE_NAME = "sys_permission_audit_log";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    /** 阶段：MODULE_STRUCTURE；权限审计是 iam 模块基础设施表。 */
    @SuppressWarnings("unused")
    private static final SchemaPhase PHASE = SchemaPhase.MODULE_STRUCTURE;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + TABLE_NAME + " ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "target_type VARCHAR(20) NOT NULL COMMENT '授权对象类型: role/department', "
                        + "target_id BIGINT NOT NULL COMMENT '角色ID 或 部门ID', "
                        + "target_name VARCHAR(128) DEFAULT NULL COMMENT '目标名称快照', "
                        + "system_code VARCHAR(64) DEFAULT NULL COMMENT '业务系统编码, 跨系统操作为 NULL', "
                        + "change_type VARCHAR(20) NOT NULL COMMENT '变更类型: GRANT/REVOKE/UPDATE/DELETE/COPY/BIND/STATUS', "
                        + "before_snapshot TEXT DEFAULT NULL COMMENT '变更前快照 JSON', "
                        + "after_snapshot TEXT DEFAULT NULL COMMENT '变更后快照 JSON', "
                        + "operator VARCHAR(64) DEFAULT NULL COMMENT '操作人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间', "
                        + "KEY idx_perm_audit_target (target_type, target_id, created_at), "
                        + "KEY idx_perm_audit_operator (operator, created_at), "
                        + "KEY idx_perm_audit_time (created_at)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='授权变更审计日志表'");
        log.info("授权审计表 {} 已就绪", TABLE_NAME);
    }

    private void verifyMigration() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, TABLE_NAME);
        if (count == null || count == 0) {
            throw new IllegalStateException(TABLE_NAME + " 表未创建成功");
        }
    }
}

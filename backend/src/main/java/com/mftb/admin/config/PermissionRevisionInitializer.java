package com.mftb.admin.config;

import com.mftb.admin.config.migration.SchemaPhase;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 权限版本号表初始化（Round 3 · 跨实例失效）。
 * <p>建 {@code sys_permission_revision} 单行表并 seed id=1, revision=0；
 * 与 {@link SystemPortalSchemaInitializer} 一起构成统一门户改造的阶段 B/Round 3 底座。
 * <p>参考 SQL: {@code backend/sql/193_permission_revision.sql}（一次性文档）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(16)
public class PermissionRevisionInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "core:permission-revision:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    /** 阶段：MODULE_STRUCTURE；权限版本号是全局共享基础设施，非业务模块结构。 */
    @SuppressWarnings("unused")
    private static final SchemaPhase PHASE = SchemaPhase.MODULE_STRUCTURE;

    private void doMigrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_permission_revision ("
                        + "id BIGINT PRIMARY KEY COMMENT '固定单行：id=1',"
                        + "revision BIGINT NOT NULL DEFAULT 0 COMMENT '全局权限版本号',"
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                        + "CONSTRAINT ck_permission_revision_singleton CHECK (id = 1)"
                        + ") COMMENT='权限版本号（跨实例即时失效）'");
        jdbcTemplate.update("INSERT IGNORE INTO sys_permission_revision (id, revision) VALUES (1, 0)");
        log.info("权限版本号表 sys_permission_revision 已就绪");
    }

    private void verifyMigration() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_permission_revision WHERE id = 1", Integer.class);
        if (count == null || count == 0) {
            throw new IllegalStateException("sys_permission_revision 单行缺失");
        }
    }
}

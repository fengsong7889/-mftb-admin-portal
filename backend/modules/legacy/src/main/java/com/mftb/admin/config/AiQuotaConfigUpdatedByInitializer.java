package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * ai_quota_config 补「最后更新人」列。
 *
 * <p>员工专属额度 / 部门额度列表一直展示「最後更新時間」，却查不到是谁改的。
 * 本迁移只补一列 {@code updated_by}（姓名为口径，与 AD 定价等模块一致），
 * 写侧由 AiQuotaServiceImpl / AiEmpPermissionServiceImpl 在保存时刷新。
 *
 * <p>版本键 {@code ai:quota-config-updated-by-v1.0}；参照 SQL {@code 285_ai_quota_config_updated_by.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(32)
public class AiQuotaConfigUpdatedByInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:quota-config-updated-by-v1.0";
    private static final String TABLE = "ai_quota_config";
    private static final String COLUMN = "updated_by";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, TABLE, COLUMN);
        if (exists != null && exists > 0) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE " + TABLE
                + " ADD COLUMN " + COLUMN + " VARCHAR(64) DEFAULT NULL COMMENT '最后更新人(姓名)' AFTER status");
        log.info("已补列 {}.{}", TABLE, COLUMN);
    }

    /** 后置校验：列不存在则抛出，不记版本，下次启动重试 */
    private void verify() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, TABLE, COLUMN);
        if (exists == null || exists == 0) {
            throw new IllegalStateException("AI 额度更新人迁移后置校验失败：" + TABLE + "." + COLUMN + " 未就绪");
        }
    }
}

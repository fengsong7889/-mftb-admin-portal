package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 敏感字段查看留痕建表（C5）。
 * <p>
 * 只记「谁看了谁的哪些字段组」，不记字段值：日志里落明文等于把泄露面扩大一次。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(26)
public class HcmPiiAccessLogSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:pii-access-log:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("敏感字段查看留痕建表失败: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS hcm_pii_access_log ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "actor VARCHAR(64) NOT NULL COMMENT '查看人账号（工号口径）', "
                        + "person_id BIGINT NOT NULL COMMENT '被查看的人员ID', "
                        + "fields VARCHAR(128) NOT NULL COMMENT '字段组 mobile,email,birthDate', "
                        + "scene VARCHAR(32) NOT NULL DEFAULT 'detail' COMMENT 'detail/list/export', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '查看时间', "
                        + "KEY idx_pii_person_time (person_id, created_at), "
                        + "KEY idx_pii_actor_time (actor, created_at)"
                        + ") COMMENT='敏感字段明文查看留痕'");
    }

    private void verify() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hcm_pii_access_log'",
                Integer.class);
        if (exists == null || exists == 0) {
            throw new IllegalStateException("hcm_pii_access_log 表未就绪");
        }
    }
}

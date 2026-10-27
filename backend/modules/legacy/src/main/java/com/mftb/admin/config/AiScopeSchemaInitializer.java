package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * AI 配置多系统作用域：护栏/推送模板补 system_code。
 *
 * <p>ADD COLUMN 不可重放，逐列查 INFORMATION_SCHEMA 后补；RDM 推送模板回填 rdm。
 * 能力/骨架/术语复用既有 domain 列，不在此处加字段。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(31)
public class AiScopeSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:scope-v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        addColumnIfAbsent("ai_guard_rule", "system_code",
                "ALTER TABLE ai_guard_rule ADD COLUMN system_code VARCHAR(32) NOT NULL DEFAULT 'common'");
        addColumnIfAbsent("ai_push_template", "system_code",
                "ALTER TABLE ai_push_template ADD COLUMN system_code VARCHAR(32) NOT NULL DEFAULT 'common'");
        int updated = jdbcTemplate.update(
                "UPDATE ai_push_template SET system_code = 'rdm' "
                        + "WHERE template_key LIKE 'rdm\\_%' AND system_code = 'common'");
        if (updated > 0) {
            log.info("AI 推送模板作用域回填 rdm: {} 行", updated);
        }
        log.info("AI 配置多系统作用域就绪: ai_guard_rule / ai_push_template 已补 system_code");
    }

    private void verify() {
        for (String table : new String[]{"ai_guard_rule", "ai_push_template"}) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'system_code'",
                    Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + ".system_code 未就绪");
            }
        }
    }

    private void addColumnIfAbsent(String table, String column, String ddl) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (exists != null && exists > 0) return;
        jdbcTemplate.execute(ddl);
        log.info("已补列 {}.{}", table, column);
    }
}

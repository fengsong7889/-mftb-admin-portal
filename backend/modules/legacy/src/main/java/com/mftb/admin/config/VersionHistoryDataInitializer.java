package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 版本发布历史表初始化器: 启动时幂等创建 sys_version_history 表并写入初始版本记录
 */
@Slf4j
@Component
@Order(16)
@RequiredArgsConstructor
public class VersionHistoryDataInitializer implements CommandLineRunner {

    static final String VERSION_INIT = "version_history:98_version_history.sql:v1";
    static final String VERSION_COMMIT_HASH = "version_history:109_version_history_commit_hash.sql:v1";
    static final String VERSION_SUMMARY_LENGTH = "version_history:110_version_history_summary_len.sql:v1";
    static final String VERSION_SUMMARY_TEXT = "version_history:summary-text-v1.0";

    private static final String INIT_SCRIPT = "98_version_history.sql";
    private static final String MIGRATION_SCRIPT = "109_version_history_commit_hash.sql";
    private static final String MIGRATION_SCRIPT_2 = "110_version_history_summary_len.sql";
    static final String SUMMARY_TEXT_SCRIPT = "348_version_history_summary_text.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_INIT, () -> executeSqlScript(INIT_SCRIPT),
                () -> requireTable("sys_version_history"));
        versionTracker.applyOnce(VERSION_COMMIT_HASH, () -> {
            if (!columnExists("sys_version_history", "commit_hash")) {
                executeSqlScript(MIGRATION_SCRIPT);
            }
        }, () -> requireColumn("sys_version_history", "commit_hash"));
        versionTracker.applyOnce(VERSION_SUMMARY_LENGTH, this::ensureSummaryLength, this::verifySummaryLength);
        versionTracker.applyOnce(VERSION_SUMMARY_TEXT, this::ensureSummaryText, this::verifySummaryText);
    }

    /** 110 只负责把旧库从 500 提到 2000；已经是 TEXT 的库不得被反向缩窄。 */
    private void ensureSummaryLength() {
        String type = columnType("sys_version_history", "summary");
        Integer width = columnLength("sys_version_history", "summary");
        if (!isTextType(type) && width != null && width >= 2000) {
            return;
        }
        executeSqlScript(MIGRATION_SCRIPT_2);
    }

    private void verifySummaryLength() {
        String type = columnType("sys_version_history", "summary");
        if (isTextType(type)) {
            return;
        }
        Integer width = columnLength("sys_version_history", "summary");
        if (width == null || width < 2000) {
            throw new IllegalStateException("sys_version_history.summary 宽度仍不足 2000");
        }
    }

    /** Git 同步按天拼接全部提交标题，VARCHAR(2000) 会被多提交日期撑爆，改用 TEXT。 */
    private void ensureSummaryText() {
        if (!isTextType(columnType("sys_version_history", "summary"))) {
            executeSqlScript(SUMMARY_TEXT_SCRIPT);
        }
    }

    private void verifySummaryText() {
        if (!isTextType(columnType("sys_version_history", "summary"))) {
            throw new IllegalStateException("sys_version_history.summary 仍不是 TEXT，Git 同步可能再次触发数据截断");
        }
    }

    private boolean isTextType(String type) {
        return "text".equalsIgnoreCase(type) || "mediumtext".equalsIgnoreCase(type);
    }

    private void requireTable(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        if (count == null || count == 0) {
            throw new IllegalStateException(table + " 表未就绪");
        }
    }

    private void requireColumn(String table, String column) {
        if (!columnExists(table, column)) {
            throw new IllegalStateException(table + "." + column + " 列未就绪");
        }
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private String columnType(String table, String column) {
        return jdbcTemplate.queryForObject(
                "SELECT DATA_TYPE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                String.class, table, column);
    }

    private Integer columnLength(String table, String column) {
        return jdbcTemplate.queryForObject(
                "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
    }

    private void executeSqlScript(String scriptName) {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到版本历史表脚本 " + scriptName);
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已执行 {} 初始化版本发布历史表", scriptName);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("读取版本历史表脚本失败: " + scriptName, e);
        }
    }
}

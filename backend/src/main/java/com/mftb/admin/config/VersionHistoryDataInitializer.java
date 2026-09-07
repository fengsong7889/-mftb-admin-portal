package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
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
@RequiredArgsConstructor
public class VersionHistoryDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "98_version_history.sql";
    private static final String MIGRATION_SCRIPT = "109_version_history_commit_hash.sql";
    private static final String MIGRATION_SCRIPT_2 = "110_version_history_summary_len.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("version_history:" + INIT_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(INIT_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("读取初始化脚本失败: " + INIT_SCRIPT, e);
                }
            });
            // 增量迁移：添加 commit_hash 字段
            versionTracker.applyOnce("version_history:" + MIGRATION_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(MIGRATION_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("读取迁移脚本失败: " + MIGRATION_SCRIPT, e);
                }
            });
            // 增量迁移：扩大 summary 字段长度
            versionTracker.applyOnce("version_history:" + MIGRATION_SCRIPT_2 + ":v1", () -> {
                try {
                    executeSqlScript(MIGRATION_SCRIPT_2);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("读取迁移脚本失败: " + MIGRATION_SCRIPT_2, e);
                }
            });
        } catch (Exception e) {
            log.error("版本发布历史表初始化失败: {}", e.getMessage(), e);
        }
    }

    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳过版本历史表初始化", scriptName);
            return;
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
        }
    }
}

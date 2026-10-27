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
import java.util.List;

/**
 * AI 助手二期结构：
 * <ul>
 *   <li>ai_conversation 增加 summary / summary_message_count / summary_updated_at；</li>
 *   <li>新建 ai_user_memory（长期记忆）与 ai_feedback（回答反馈）。</li>
 * </ul>
 *
 * <p>ADD COLUMN 不可重放：逐列先查 INFORMATION_SCHEMA；CREATE TABLE IF NOT EXISTS 可重放。
 * <p>后置校验不齐不记版本，下次启动重试。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(26)
public class AiAssistantPhase2SchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:assistant-phase2-v1.0";
    private static final String SCRIPT = "273_ai_assistant_phase2.sql";
    private static final List<String> TABLES = List.of("ai_user_memory", "ai_feedback");
    private static final List<String[]> CONVERSATION_COLUMNS = List.of(
            new String[]{"summary", "TEXT NULL COMMENT '滚动历史摘要'"},
            new String[]{"summary_message_count", "INT NOT NULL DEFAULT 0 COMMENT '已摘要的消息条数'"},
            new String[]{"summary_updated_at", "DATETIME NULL COMMENT '摘要更新时间'"}
    );

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        executeSqlScript();
        for (String[] column : CONVERSATION_COLUMNS) {
            addColumnIfAbsent("ai_conversation", column[0], column[1]);
        }
        log.info("AI 助手二期结构就绪: ai_user_memory + ai_feedback + ai_conversation 摘要三列");
    }

    private void verify() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException("AI 助手二期表未就绪: " + table);
            }
        }
        for (String[] column : CONVERSATION_COLUMNS) {
            if (!columnExists("ai_conversation", column[0])) {
                throw new IllegalStateException("ai_conversation 缺列: " + column[0]);
            }
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private void addColumnIfAbsent(String table, String column, String definition) {
        if (!columnExists(table, column)) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("ai_conversation 补列: {}", column);
        }
    }

    private void executeSqlScript() {
        ClassPathResource resource = new ClassPathResource(SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 AI 助手二期脚本: " + SCRIPT);
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
            log.info("已执行 AI 助手二期脚本: {}", SCRIPT);
        } catch (Exception e) {
            throw new IllegalStateException("执行 AI 助手二期脚本失败: " + SCRIPT, e);
        }
    }
}

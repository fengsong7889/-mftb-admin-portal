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
 * AI 助手三期底座：知识库/护栏建表 + search_knowledge 工具注册 + 全文索引探测。
 *
 * <p>全文索引不在 SQL 脚本里执行：部分环境不支持 ngram 解析器，直接写进脚本会让
 * 整段迁移失败、服务起不来。这里按“ngram → 普通 FULLTEXT → 仅 LIKE 回退”逐级降级，
 * 任一级失败只记警告；检索服务本身已有 LIKE 兜底。
 *
 * <p>脚本只 CREATE IF NOT EXISTS / INSERT IGNORE，不覆盖管理员已改的配置。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(27)
public class AiAssistantPhase3SchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:assistant-phase3-v1.0";
    private static final String SCRIPT = "274_ai_phase3.sql";
    private static final List<String> TABLES = List.of(
            "ai_knowledge_doc", "ai_knowledge_chunk", "ai_guard_rule");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        executeSqlScript(SCRIPT);
        ensureFullTextIndex();
        log.info("AI 助手三期底座就绪: 知识库表 + 护栏表 + search_knowledge 工具");
    }

    private void verify() {
        for (String table : TABLES) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就绪");
            }
        }
        Integer tools = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM mcp_tool WHERE tool_key = 'search_knowledge' AND deleted = 0",
                Integer.class);
        if (tools == null || tools == 0) {
            throw new IllegalStateException("search_knowledge 未注册到 mcp_tool");
        }
        Integer policies = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_tool_policy WHERE tool_key = 'search_knowledge'",
                Integer.class);
        if (policies == null || policies == 0) {
            throw new IllegalStateException("search_knowledge 未登记 ai_tool_policy");
        }
        Integer capabilities = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_capability WHERE tool_key = 'search_knowledge'",
                Integer.class);
        if (capabilities == null || capabilities == 0) {
            throw new IllegalStateException("search_knowledge 未登记 ai_capability");
        }
    }

    private void ensureFullTextIndex() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_knowledge_chunk' "
                        + "AND INDEX_NAME = 'ft_ai_knowledge_chunk'",
                Integer.class);
        if (exists != null && exists > 0) return;
        try {
            jdbcTemplate.execute("ALTER TABLE ai_knowledge_chunk "
                    + "ADD FULLTEXT INDEX ft_ai_knowledge_chunk (content) WITH PARSER ngram");
            log.info("知识库全文索引已创建（ngram）");
            return;
        } catch (Exception e) {
            log.warn("ngram 全文索引不可用，尝试普通 FULLTEXT: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE ai_knowledge_chunk "
                    + "ADD FULLTEXT INDEX ft_ai_knowledge_chunk (content)");
            log.info("知识库全文索引已创建（默认解析器）");
        } catch (Exception e) {
            log.warn("全文索引创建失败，检索将走 LIKE 回退: {}", e.getMessage());
        }
    }

    private void executeSqlScript(String scriptName) {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 AI 助手三期脚本: " + scriptName);
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
            log.info("已执行 AI 助手三期脚本: {}", scriptName);
        } catch (Exception e) {
            throw new IllegalStateException("执行 AI 助手三期脚本失败: " + scriptName, e);
        }
    }
}

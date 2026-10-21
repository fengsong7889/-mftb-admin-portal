package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 长期记忆相关检索索引：给 ai_user_memory.content 建 FULLTEXT（优先 ngram）。
 *
 * <p>与知识库一致：索引创建失败不让服务起不来，服务层有 LIKE 回退；
 * 只在日志里留下降级原因，便于后续排查检索质量。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(29)
public class AiMemorySearchIndexInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:memory-search-index-v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::ensureIndex, () -> log.info("长期记忆检索索引检查完成"));
    }

    private void ensureIndex() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_user_memory' "
                        + "AND INDEX_NAME = 'ft_ai_user_memory_content'",
                Integer.class);
        if (exists != null && exists > 0) return;
        try {
            jdbcTemplate.execute("ALTER TABLE ai_user_memory "
                    + "ADD FULLTEXT INDEX ft_ai_user_memory_content (content) WITH PARSER ngram");
            log.info("长期记忆全文索引已创建（ngram）");
            return;
        } catch (Exception e) {
            log.warn("长期记忆 ngram 索引不可用，尝试普通 FULLTEXT: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE ai_user_memory "
                    + "ADD FULLTEXT INDEX ft_ai_user_memory_content (content)");
            log.info("长期记忆全文索引已创建（默认解析器）");
        } catch (Exception e) {
            log.warn("长期记忆全文索引创建失败，检索将走 LIKE 回退: {}", e.getMessage());
        }
    }
}

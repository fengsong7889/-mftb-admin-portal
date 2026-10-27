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
 * 二期遗漏项：lookup_glossary 工具登记。
 *
 * <p>只登记工具元数据，不建表；执行结果必须同时出现在 mcp_tool / ai_tool_policy /
 * ai_capability 三处，缺一处管理页或能力清单就不同源。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(28)
public class AiLookupGlossaryToolInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:lookup-glossary-tool-v1.0";
    private static final String SCRIPT = "276_ai_lookup_glossary.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
    }

    private void migrate() {
        ClassPathResource resource = new ClassPathResource(SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 lookup_glossary 工具脚本: " + SCRIPT);
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
            log.info("lookup_glossary 工具登记完成");
        } catch (Exception e) {
            throw new IllegalStateException("执行 lookup_glossary 工具脚本失败: " + SCRIPT, e);
        }
    }

    private void verify() {
        Integer tool = count("SELECT COUNT(*) FROM mcp_tool WHERE tool_key = 'lookup_glossary' AND deleted = 0");
        Integer policy = count("SELECT COUNT(*) FROM ai_tool_policy WHERE tool_key = 'lookup_glossary'");
        Integer capability = count("SELECT COUNT(*) FROM ai_capability WHERE tool_key = 'lookup_glossary'");
        if (tool == null || tool == 0) throw new IllegalStateException("lookup_glossary 未注册到 mcp_tool");
        if (policy == null || policy == 0) throw new IllegalStateException("lookup_glossary 未登记 ai_tool_policy");
        if (capability == null || capability == 0) throw new IllegalStateException("lookup_glossary 未登记 ai_capability");
    }

    private Integer count(String sql) {
        return jdbcTemplate.queryForObject(sql, Integer.class);
    }
}

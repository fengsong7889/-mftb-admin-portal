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
 * AI 助手配置中心收尾批：运行参数表 + 记忆策略默认值 + 快捷提问种子。
 *
 * <p>只建表与补默认值，不覆盖管理员已改的配置（CREATE IF NOT EXISTS / INSERT IGNORE）。
 * 推送模板不进种子：内置文案以 Java 默认值为准，避免库里存一份会与代码漂移的副本。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(30)
public class AiAssistantPhase4SchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:assistant-config-ops-v1.0";
    private static final String SCRIPT = "277_ai_config_ops.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        executeSqlScript(SCRIPT);
        log.info("AI 助手配置中心收尾批就绪: ai_runtime_setting + 快捷提问种子");
    }

    private void verify() {
        Integer table = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_runtime_setting'",
                Integer.class);
        if (table == null || table == 0) {
            throw new IllegalStateException("ai_runtime_setting 表未就绪");
        }
        Integer settings = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_runtime_setting WHERE setting_key LIKE 'memory.%'",
                Integer.class);
        if (settings == null || settings < 4) {
            throw new IllegalStateException("记忆策略默认值未就绪（应为 4 项）");
        }
        Integer prompts = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_quick_prompt WHERE enabled = 1", Integer.class);
        if (prompts == null || prompts == 0) {
            throw new IllegalStateException("快捷提问种子未就绪");
        }
    }

    private void executeSqlScript(String scriptName) {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 AI 助手配置中心收尾脚本: " + scriptName);
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
            log.info("已执行 AI 助手配置中心收尾脚本: {}", scriptName);
        } catch (Exception e) {
            throw new IllegalStateException("执行 AI 助手配置中心收尾脚本失败: " + scriptName, e);
        }
    }
}

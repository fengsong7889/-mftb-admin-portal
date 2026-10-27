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
 * AI 助手 RDM 工具治理底座：
 * <ol>
 *   <li>注册 11 个 RDM 工具到 mcp_tool（工具广场/AI 操作授权展示）；</li>
 *   <li>补齐 ai_tool_policy（内建工具默认放行，推送工具 medium）；</li>
 *   <li>建 ai_action_request 表（确认卡状态机）；</li>
 *   <li>注册 ai_assistant_work 通知场景（默认不绑定应用）。</li>
 * </ol>
 *
 * <p>幂等 + 后置校验；失败不记版本，下次启动重试。脚本只 ADD/CREATE/INSERT IGNORE，
 * 不覆盖管理员已改过的描述、排序或授权。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(24)
public class AiAssistantToolSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:assistant-tools-v1.0";
    private static final List<String> SCRIPTS = List.of(
            "269_mcp_tool_rdm.sql",
            "270_ai_action_request.sql",
            "271_ai_notification_scenario.sql");
    private static final List<String> RDM_TOOL_KEYS = List.of(
            "rdm_list_projects", "rdm_project_progress", "rdm_list_iterations",
            "rdm_query_requirements", "rdm_requirement_detail", "rdm_my_todos",
            "rdm_person_workload", "rdm_stats_overview", "rdm_risks", "rdm_list_tasks",
            "rdm_prepare_progress_push");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        for (String script : SCRIPTS) {
            executeSqlScript(script);
        }
        for (String key : RDM_TOOL_KEYS) {
            insertPolicyIfAbsent(key, "rdm_prepare_progress_push".equals(key) ? "medium" : "low");
        }
        log.info("AI 助手 RDM 工具底座就绪: mcp_tool={} 个, ai_action_request + ai_assistant_work", RDM_TOOL_KEYS.size());
    }

    private void verify() {
        Integer table = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_action_request'",
                Integer.class);
        if (table == null || table == 0) {
            throw new IllegalStateException("ai_action_request 表未就绪");
        }
        Integer scenario = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_notification_scenario WHERE scenario_key = 'ai_assistant_work'",
                Integer.class);
        if (scenario == null || scenario == 0) {
            throw new IllegalStateException("ai_assistant_work 通知场景未就绪");
        }
        Integer tools = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM mcp_tool WHERE tool_key LIKE 'rdm_%' AND deleted = 0",
                Integer.class);
        if (tools == null || tools < RDM_TOOL_KEYS.size()) {
            throw new IllegalStateException("RDM 工具未全部注册到 mcp_tool: " + tools);
        }
        Integer policies = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_tool_policy WHERE tool_key LIKE 'rdm_%'",
                Integer.class);
        if (policies == null || policies < RDM_TOOL_KEYS.size()) {
            throw new IllegalStateException("RDM 工具策略未全部登记: " + policies);
        }
    }

    private void insertPolicyIfAbsent(String toolKey, String riskLevel) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_tool_policy WHERE tool_key = ?", Integer.class, toolKey);
        if (exists != null && exists > 0) return;
        jdbcTemplate.update(
                "INSERT INTO ai_tool_policy (tool_key, enabled, risk_level, require_approval, updated_by) "
                        + "VALUES (?, 1, ?, 0, 'system')",
                toolKey, riskLevel);
    }

    private void executeSqlScript(String scriptName) {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 AI 助手工具脚本: " + scriptName);
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
            log.info("已执行 AI 助手工具脚本: {}", scriptName);
        } catch (Exception e) {
            throw new IllegalStateException("执行 AI 助手工具脚本失败: " + scriptName, e);
        }
    }
}

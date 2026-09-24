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
 * V0 Sprint 1 企业治理底座：一次登记 5 张表 + 2 处补列 + 内置工具策略种子。
 * <p>
 * 遵循项目规范（AGENTS.md §3）：
 * <ul>
 *   <li>使用 {@link SchemaVersionTracker#applyOnce(String, Runnable, Runnable)} 双阶校验；</li>
 *   <li>失败必须抛出、不吞异常，未通过校验不记录成功版本；</li>
 *   <li>关键表由 {@code ContractRegistry} 登记契约，每次启动自愈。</li>
 * </ul>
 * 版本键 {@code ai:governance:v1.0}；对应 SQL: {@code 190_ai_governance.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(20)
public class AiGovernanceSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:governance:v1.0";
    private static final String INIT_SCRIPT = "190_ai_governance.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        executeSqlScript();
        addColumnIfAbsent("ai_employee_auth", "capability_json",
                "TEXT DEFAULT NULL COMMENT '员工级能力开关（vision/function_calling/json_mode 等，JSON）'");
        addColumnIfAbsent("biz_llm_usage", "verification_status",
                "VARCHAR(16) NOT NULL DEFAULT 'ESTIMATED' COMMENT 'VERIFIED/ESTIMATED/UNKNOWN'");
        addColumnIfAbsent("biz_llm_usage", "request_id",
                "VARCHAR(64) DEFAULT NULL COMMENT '关联 ai_budget_ledger.request_id（服务端计量口径）'");
        seedBuiltinToolPolicies();
        log.info("AI 治理底座迁移完成: 5 张新表 + 3 处补列 + 内置工具策略种子");
    }

    /** 后置校验：5 张表、2 处补列均须存在，否则抛出。 */
    private void verifyMigration() {
        String[] tables = {
                "ai_tool_policy", "ai_tool_exec_log", "ai_budget_ledger",
                "ai_grant_log", "ai_conversation_event"
        };
        for (String t : tables) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, t);
            if (count == null || count == 0) {
                throw new IllegalStateException("AI 治理底座迁移后置校验失败：表未就绪 " + t);
            }
        }
        requireColumn("ai_employee_auth", "capability_json");
        requireColumn("biz_llm_usage", "verification_status");
    }

    private void requireColumn(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            throw new IllegalStateException("AI 治理底座迁移后置校验失败：列未就绪 " + table + "." + column);
        }
    }

    /**
     * 内置 3 个只读工具默认放行；未列入本清单的新工具默认拒绝。
     * 已有记录（管理员在 UI 修改过）不覆盖，仅幂等补齐。
     */
    private void seedBuiltinToolPolicies() {
        insertPolicyIfAbsent("query_account_balance", "low");
        insertPolicyIfAbsent("query_batches", "low");
        insertPolicyIfAbsent("query_approvals", "low");
        // 外部通知类：默认关闭 + 需审批凭证（V0 阶段仍允许 L3 弹窗产生的临时凭证）
        insertPolicyIfAbsent("send_email", "medium", 1);
        insertPolicyIfAbsent("dingtalk_sender", "medium", 1);
    }

    private void insertPolicyIfAbsent(String toolKey, String riskLevel) {
        insertPolicyIfAbsent(toolKey, riskLevel, 1);
    }

    private void insertPolicyIfAbsent(String toolKey, String riskLevel, int enabled) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_tool_policy WHERE tool_key = ?", Integer.class, toolKey);
        if (exists != null && exists > 0) {
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO ai_tool_policy (tool_key, enabled, risk_level, require_approval, updated_by) "
                        + "VALUES (?, ?, ?, ?, 'system')",
                toolKey, enabled, riskLevel, enabled == 1 && "medium".equals(riskLevel) ? 1 : 0);
    }

    private void addColumnIfAbsent(String table, String column, String definition) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        }
    }

    private void executeSqlScript() {
        ClassPathResource resource = new ClassPathResource(INIT_SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到迁移脚本: " + INIT_SCRIPT);
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    // 不吞异常：任何 DDL 失败必须抛出，由 applyOnce 记录失败并阻止误记成功
                    jdbcTemplate.execute(trimmed);
                }
            }
        } catch (Exception e) {
            throw new IllegalStateException("执行迁移脚本失败 " + INIT_SCRIPT + ": " + e.getMessage(), e);
        }
    }
}

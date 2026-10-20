package com.mftb.admin.config;

import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.AiToolPolicyMapper;
import com.mftb.admin.mapper.McpToolMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 工具风险等级数据对齐（治理「同一工具两页两个等级」）。
 * <p><b>根因</b>：风险等级存在两套口径且互不同步 —— {@code mcp_tool.risk_level} 存展示分级
 * {@code L0~L4}，{@code ai_tool_policy.risk_level} 存执行分级 {@code low/medium/high}，
 * 而<b>只有后者参与服务端 enforce</b>。再叠上早期种子的键名写错（{@code send_email}，
 * 实际工具是 {@code email_sender}），外部工具里 3 个根本没有 policy 行。
 * 结果：工具广场说「L3 需審批」，AI 操作授权说「L0 禁止調用」，管理员无法判断哪个是真的。
 * <p><b>口径</b>：执行闸门只认 {@code ai_tool_policy}；工具清单（mcp_tool）缺 policy 行时按
 * 「默认拒绝」补齐，风险等级由 L 级映射（L1→low、L2/L3→medium/high）。已存在的行不覆盖，
 * 保留管理员在 UI 上做过的调整。
 * <p>幂等 + 后置校验；失败抛出，不吞异常（对齐 {@code backend-sql-migration} 规范）。
 * <p>v1.1：补上「从未被人工改过的策略行（updated_by=system）按 mcp_tool 的 L 级重写」，
 * 否则邮件/钉钉工具会继续停在种子随手写的 medium（页面上显 L2），与工具广场的 L3 不一致。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(23)
public class AiToolPolicyAlignInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:tool-policy-align:v1.1";
    private static final String OPERATOR = "system-tool-policy-align";
    /** 早期种子写错的外部邮件工具键（实际 mcp_tool.tool_key 是 email_sender） */
    private static final String LEGACY_EMAIL_KEY = "send_email";
    private static final String EMAIL_KEY = "email_sender";
    /** 种子时代的操作人：这类行从未被管理员改过，可以放心按工具清单的 L 级重写 */
    private static final String LEGACY_SEED_OPERATOR = "system";

    private final McpToolMapper mcpToolMapper;
    private final AiToolPolicyMapper policyMapper;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        // 1) 先纠正错键：只有当 email_sender 还没有 policy 行时才改名，避免撞唯一键
        boolean emailTaken = policyMapper.exists(new LambdaQueryWrapper<AiToolPolicy>()
                .eq(AiToolPolicy::getToolKey, EMAIL_KEY));
        if (!emailTaken) {
            int renamed = policyMapper.update(null, new LambdaUpdateWrapper<AiToolPolicy>()
                    .eq(AiToolPolicy::getToolKey, LEGACY_EMAIL_KEY)
                    .set(AiToolPolicy::getToolKey, EMAIL_KEY)
                    .set(AiToolPolicy::getUpdatedAt, LocalDateTime.now()));
            if (renamed > 0) {
                log.info("已将工具策略键 {} 改正为 {}（否则该外部工具永远查不到自己的策略）", LEGACY_EMAIL_KEY, EMAIL_KEY);
            }
        } else {
            policyMapper.delete(new LambdaQueryWrapper<AiToolPolicy>().eq(AiToolPolicy::getToolKey, LEGACY_EMAIL_KEY));
        }

        // 2) 工具清单里缺策略的，按「默认拒绝」补登记；风险等级用 L 级映射到执行口径
        List<McpTool> tools = mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                .select(McpTool::getToolKey, McpTool::getRiskLevel));
        Set<String> registered = new LinkedHashSet<>();
        policyMapper.selectList(new LambdaQueryWrapper<AiToolPolicy>().select(AiToolPolicy::getToolKey))
                .forEach(p -> registered.add(p.getToolKey()));
        int inserted = 0;
        for (McpTool tool : tools) {
            String key = tool.getToolKey();
            if (key == null || key.isBlank() || registered.contains(key)) {
                continue;
            }
            AiToolPolicy policy = new AiToolPolicy();
            policy.setToolKey(key);
            policy.setRiskLevel(toExecutionRisk(tool.getRiskLevel()));
            // 未登记过的工具默认不放行：补齐行是为了「看得见真实状态」，不是为了打开能力
            policy.setEnabled(0);
            policy.setUpdatedBy(OPERATOR);
            policyMapper.insert(policy);
            inserted++;
        }
        log.info("工具策略对齐: 补齐缺策略的工具={}, 操作人={}", inserted, OPERATOR);

        // 3) 已存在但从未被人工改过的策略行（种子写的 system）：按工具清单的 L 级重写，
        //    否则种子里的 medium 会与工具广场的 L3 长期不一致；管理员在 UI 上改过的行一律不动。
        int refreshed = 0;
        for (McpTool tool : mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                .select(McpTool::getToolKey, McpTool::getRiskLevel))) {
            if (tool.getToolKey() == null || tool.getToolKey().isBlank()) {
                continue;
            }
            String expected = toExecutionRisk(tool.getRiskLevel());
            refreshed += policyMapper.update(null, new LambdaUpdateWrapper<AiToolPolicy>()
                    .eq(AiToolPolicy::getToolKey, tool.getToolKey())
                    .and(w -> w.eq(AiToolPolicy::getUpdatedBy, LEGACY_SEED_OPERATOR).or().isNull(AiToolPolicy::getUpdatedBy))
                    .ne(AiToolPolicy::getRiskLevel, expected)
                    .set(AiToolPolicy::getRiskLevel, expected)
                    .set(AiToolPolicy::getUpdatedAt, LocalDateTime.now()));
        }
        log.info("工具策略对齐: 按工具清单 L 级重写未人工调整的策略行={}, 操作人={}", refreshed, OPERATOR);
    }

    /** L0~L4 展示分级 → low/medium/high 执行分级；未知等级按 high（宁严勿松）。 */
    static String toExecutionRisk(String level) {
        if (level == null) {
            return "high";
        }
        return switch (level.trim().toUpperCase()) {
            case "L0", "L1" -> "low";
            case "L2" -> "medium";
            default -> "high";
        };
    }

    /** 后置校验：工具清单里每个工具都要有策略行，否则页面仍会出现「两页两个等级」。 */
    private void verifyMigration() {
        List<String> toolKeys = mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                        .select(McpTool::getToolKey))
                .stream().map(McpTool::getToolKey).filter(k -> k != null && !k.isBlank()).toList();
        Set<String> registered = new LinkedHashSet<>();
        policyMapper.selectList(new LambdaQueryWrapper<AiToolPolicy>().select(AiToolPolicy::getToolKey))
                .forEach(p -> registered.add(p.getToolKey()));
        List<String> missing = toolKeys.stream().filter(k -> !registered.contains(k)).toList();
        if (!missing.isEmpty()) {
            throw new IllegalStateException("以下工具仍无 ai_tool_policy 行，风险等级双源未消除: " + missing);
        }
    }
}

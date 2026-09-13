package com.mftb.admin.security.permission;

import com.mftb.admin.controller.*;
import com.mftb.admin.security.SecurityTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * R-24 安全测试: 无 @RequirePermission 注解接口审计
 * <p>
 * 审计所有仅依赖 JWT 认证但无细粒度权限控制的 API 端点。
 * <p>
 * 安全修复记录 (2026-09-13):
 * - McpExecController: 已添加 @RequirePermission(menu = "ai-mcp-service")
 * - BizSeqRuleController: 已添加 @RequirePermission(menu = "rule-config", action = "view")
 * - LlmUsageController: summary/records 已添加 @RequirePermission(menu = "ai_usage_stats", action = "view")
 * - NotificationController: 保持现状（个人通知，仅需认证）
 * - IconfontController: 保持现状（公共头像资源，无敏感数据）
 * - CardOrderController: 保持现状（个人 UI 偏好）
 */
@WebMvcTest({
        McpExecController.class,
        BizSeqRuleController.class,
        LlmUsageController.class,
        NotificationController.class,
        IconfontController.class,
        CardOrderController.class
})
@DisplayName("R-24: 无权限注解 API 审计")
class UnprotectedApiAuditTest extends SecurityTestBase {

    // ── MCP 工具执行（已修复: 需要 ai-mcp-service 权限） ──

    @Test
    @DisplayName("[已修复] 访客访问 MCP 执行接口 → 403（需 ai-mcp-service 权限）")
    void mcpExecBlockedForGuest() throws Exception {
        denyAllPermissions(guestUser);
        mockMvc.perform(authPost("/api/mcp/exec", guestUser)
                        .contentType("application/json")
                        .content("{\"toolKey\":\"test\",\"args\":{}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
    }

    // ── 编号规则管理（已修复: 需要 rule-config view 权限） ──

    @Test
    @DisplayName("[已修复] 访客访问编号规则列表 → 403（需 rule-config view 权限）")
    void bizSeqRuleBlockedForGuest() throws Exception {
        denyAllPermissions(guestUser);
        mockMvc.perform(authGet("/api/biz-seq-rules", guestUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
    }

    // ── LLM 用量查询（已修复: 需要 ai_usage_stats view 权限） ──

    @Test
    @DisplayName("[已修复] 访客访问 LLM 用量汇总 → 403（需 ai_usage_stats view 权限）")
    void llmUsageSummaryBlockedForGuest() throws Exception {
        denyAllPermissions(guestUser);
        mockMvc.perform(authGet("/api/llm-usage/summary?startDate=2026-01-01&endDate=2026-12-31", guestUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
    }

    @Test
    @DisplayName("[已修复] 访客访问 LLM 用量明细 → 403（需 ai_usage_stats view 权限）")
    void llmUsageRecordsBlockedForGuest() throws Exception {
        denyAllPermissions(guestUser);
        mockMvc.perform(authGet("/api/llm-usage/records?startDate=2026-01-01&endDate=2026-12-31", guestUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
    }

    // ── 通知接口（保持现状: 个人通知，仅需认证） ──

    @Test
    @DisplayName("[低风险] 访客可访问通知列表 — 个人数据，无需额外权限")
    void notificationAccessibleByAnyUser() throws Exception {
        mockMvc.perform(authGet("/api/notifications", guestUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    // ── 认证基准: 确认未认证请求确实被拦截 ──

    @Test
    @DisplayName("基准验证: 无 Token 访问编号规则 → 401")
    void noTokenBlocked() throws Exception {
        mockMvc.perform(get("/api/biz-seq-rules"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
    }
}

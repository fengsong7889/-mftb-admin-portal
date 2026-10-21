package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiConversationService;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.agent.AgentOrchestrationService.OrchestrateRequest;
import com.mftb.admin.service.agent.AgentOrchestrationService.OrchestrateResult;
import com.mftb.admin.service.agent.LlmChannelRouter.Channel;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.service.agent.tool.AgentTool.ToolCallContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §B.1：后端 tool 循环编排的关键路径（无渠道、额度拒绝、内建工具执行、外部工具 pending、通道配置缺失） */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AgentOrchestrationServiceTest {

    @Mock private LlmChannelRouter channelRouter;
    @Mock private AiMyCenterService myCenterService;
    @Mock private AiConversationEventService eventService;
    @Mock private AiConversationService conversationService;
    @Mock private LlmHttpClient llmClient;
    @Mock private LlmMeteringService metering;
    @Mock private AgentTool dummyTool;
    @Mock private com.mftb.admin.mapper.McpToolMapper mcpToolMapper;
    @Mock private com.mftb.admin.mapper.AiToolPolicyMapper toolPolicyMapper;
    @Mock private com.mftb.admin.service.AiToolPolicyService toolPolicyService;
    @Mock private com.mftb.admin.util.OperatorResolver operatorResolver;
    @Mock private AiGuardrailService guardrailService;
    @Mock private AiUserMemoryService memoryService;
    @Mock private AiPromptConfigService promptConfigService;

    private final ObjectMapper mapper = new ObjectMapper();

    private AgentOrchestrationService buildService() {
        when(mcpToolMapper.selectList(any())).thenReturn(List.of());
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of());
        when(dummyTool.toolKey()).thenReturn("query_account_balance");
        when(dummyTool.description()).thenReturn("desc");
        when(dummyTool.schema()).thenReturn(Map.of("type", "object", "properties", Map.of()));
        // A3：服务端模型准入——默认给授权，让主链路用例能跑到 LLM；deny 场景单独写用例
        when(myCenterService.hasModelAccess(any())).thenReturn(true);
        // A1：token 汇总现在来自计量层（服务端观测到的 usage），这里按真实口径回推，避开测回 0
        when(metering.settle(any(), any(), any(), any(), any())).thenAnswer(inv -> {
            JsonNode usage = ((JsonNode) inv.getArgument(4)).path("usage");
            return usage.path("prompt_tokens").asLong(0) + usage.path("completion_tokens").asLong(0);
        });
        return new AgentOrchestrationService(List.of(dummyTool), channelRouter, myCenterService,
                eventService, llmClient, mapper, metering, conversationService, mcpToolMapper, toolPolicyMapper,
                toolPolicyService, promptConfigService, operatorResolver, guardrailService, memoryService);
    }

    private JsonNode json(String raw) {
        try {
            return mapper.readTree(raw);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void missingChannelShortCircuitsWithText() {
        AgentOrchestrationService svc = buildService();
        when(channelRouter.resolveChannel(any(), any())).thenReturn(null);
        OrchestrateRequest req = request("user hi");
        OrchestrateResult out = svc.orchestrate(req, "alice");
        assertTrue(out.getText().contains("沒有可用模型"));
    }

    @Test
    void quotaRejectReturnsTextNoLlmCall() {
        AgentOrchestrationService svc = buildService();
        Channel ch = channel();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(ch);
        AiMyCenterDTO.QuotaCheckVO q = new AiMyCenterDTO.QuotaCheckVO();
        q.setAction("reject"); q.setMessage("已超額");
        when(myCenterService.checkQuota(any(), any())).thenReturn(q);

        OrchestrateResult out = svc.orchestrate(request("hi"), "alice");
        assertEquals("已超額", out.getText());
        verify(llmClient, never()).chatCompletion(any(), any(), any());
    }

    @Test
    void runsBuiltinToolAndFinalizes() {
        AgentOrchestrationService svc = buildService();
        Channel ch = channel();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(ch);
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        // 第一轮：LLM 返回 tool_calls
        String round1 = "{\"model\":\"deepseek-x\",\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"\",\"tool_calls\":[{\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"query_account_balance\",\"arguments\":\"{}\"}}]}}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}";
        // 第二轮：LLM 返回文本
        String round2 = "{\"model\":\"deepseek-x\",\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"余额 100\"}}],\"usage\":{\"prompt_tokens\":15,\"completion_tokens\":8}}";
        when(llmClient.chatCompletion(any(), any(), any())).thenReturn(json(round1), json(round2));
        when(dummyTool.execute(any(), any())).thenReturn("{\"total\":1}");

        OrchestrateResult out = svc.orchestrate(request("查一下余额"), "alice");
        assertEquals("余额 100", out.getText());
        assertEquals(38L, out.getTokens());
        // A1：每一轮上游往返都要预占 + 结算，不能只回文本不落账（旧缺陷：问答不进 biz_llm_usage）
        verify(metering, times(2)).reserve(any(), eq("alice"), any(), anyInt(), anyInt());
        verify(metering, times(2)).settle(any(), eq("alice"), any(), any(), any());
        verify(dummyTool, times(1)).execute(any(), any(ToolCallContext.class));
        // 事件：USER_TURN + 每轮 QUOTA_CHARGE + TOOL_CALL/TOOL_RESULT + ASSISTANT_TURN
        ArgumentCaptor<String> typeCap = ArgumentCaptor.forClass(String.class);
        verify(eventService, times(6)).append(any(), any(), typeCap.capture(), any(), any());
        assertEquals(List.of("USER_TURN", "QUOTA_CHARGE", "TOOL_CALL", "TOOL_RESULT",
                        "QUOTA_CHARGE", "ASSISTANT_TURN"),
                typeCap.getAllValues());
        // B4：回合完成后服务端必须记一次调用并固定实际模型（以前没人写，审计页两列永远 --）
        verify(conversationService, times(1)).recordAgentTurn(eq(1L), eq("alice"), eq("deepseek-x"));
        // D2：内建工具执行要进 ai_tool_exec_log，否则「執行日誌」页永远为空
        verify(toolPolicyService, times(1)).logExecution(any());
    }

    @Test
    void pendingExternalToolReturnsWithoutExecuting() {
        AgentOrchestrationService svc = buildService();
        Channel ch = channel();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(ch);
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        String body = "{\"model\":\"m\",\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"\","
                + "\"tool_calls\":[{\"id\":\"call_9\",\"type\":\"function\",\"function\":{\"name\":\"email_sender\",\"arguments\":\"{\\\"to\\\":\\\"x@y.z\\\"}\"}}]}}],"
                + "\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}";
        when(llmClient.chatCompletion(any(), any(), any())).thenReturn(json(body));

        OrchestrateResult out = svc.orchestrate(request("发邮件"), "alice");
        assertNotNull(out.getPendingExternalCalls());
        assertEquals(1, out.getPendingExternalCalls().size());
        Map<?, ?> first = (Map<?, ?>) out.getPendingExternalCalls().get(0);
        assertEquals("email_sender", first.get("name"));
        verify(dummyTool, never()).execute(any(), any());
    }

    /**
     * 通道缺 API Key 时必须给「去供应商管理补配置」的文案，而不是「稍后再试」——
     * 线上真实踩过：Key 为空时用户与管理员都把它当成模型故障反复重试。
     */
    @Test
    void misconfiguredChannelTellsAdminToFixProvider() {
        AgentOrchestrationService svc = buildService();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        when(llmClient.chatCompletion(any(), any(), any())).thenThrow(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.MISSING_KEY, null, "AI 通道未配置 API Key"));

        OrchestrateResult out = svc.orchestrate(request("hi"), "alice");
        assertTrue(out.getText().contains("API Key"), "应指向配置缺失：" + out.getText());
        verify(eventService, times(1)).append(any(), any(), eq("GATEWAY_ERROR"), any(), any());
    }

    /** 逾时（思考型模型跑满读超时）单独文案，让用户知道可以重简提问而不是服务挂了。 */
    @Test
    void timeoutChannelTellsUserToRetry() {
        AgentOrchestrationService svc = buildService();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        when(llmClient.chatCompletion(any(), any(), any())).thenThrow(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.TIMEOUT, null, "上游讀取逾時"));

        OrchestrateResult out = svc.orchestrate(request("hi"), "alice");
        assertTrue(out.getText().contains("逾時"), "应指向逾时：" + out.getText());
        // 失败轮必须释放预占，不然账上会留一条永久 RESERVED
        verify(metering, times(1)).release(any(), eq("TIMEOUT"));
    }

    /**
     * A3：未授权模型必须在后端拦住。
     * <p>钉住的原因：首页把输入框置灰只是 UX，不是安全边界——以前直接 POST /api/agent/orchestrate
     * 就能绕开“未開通”偷跑模型，计量与权控形同虚设。
     */
    @Test
    void unauthorizedModelRejectedAtServerSide() {
        AgentOrchestrationService svc = buildService();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.hasModelAccess(any())).thenReturn(false);

        OrchestrateResult out = svc.orchestrate(request("hi"), "alice");
        assertTrue(out.getText().contains("未被授權"), "应拒绝：" + out.getText());
        verify(llmClient, never()).chatCompletion(any(), any(), any());
        verify(eventService, times(1)).append(any(), any(), eq("POLICY_DECISION"), any(), any());
    }

    private static OrchestrateRequest request(String userText) {
        OrchestrateRequest r = new OrchestrateRequest();
        r.setMessages(List.of(Map.of("role", "user", "content", userText)));
        r.setConversationPk(1L);
        return r;
    }

    private static Channel channel() {
        Channel c = new Channel();
        c.setLabel("primary");
        c.setBaseUrl("https://api.deepseek.com");
        c.setApiKey("sk-test");
        c.setDefaultModelKey("deepseek-chat");
        c.setInputPrice(new java.math.BigDecimal("1"));
        c.setOutputPrice(new java.math.BigDecimal("2"));
        c.setCurrency("CNY");
        return c;
    }

    private static AiMyCenterDTO.QuotaCheckVO allowed() {
        AiMyCenterDTO.QuotaCheckVO q = new AiMyCenterDTO.QuotaCheckVO();
        q.setAction("allow"); q.setAllowed(true);
        return q;
    }

    @Test
    void externalInstalledAndEnabledToolAppearsInSchema() {
        AgentOrchestrationService svc = buildService();
        com.mftb.admin.entity.McpTool tool = new com.mftb.admin.entity.McpTool();
        tool.setToolKey("email_sender");
        tool.setDescription("發送郵件");
        tool.setParamsJson("{\"type\":\"object\",\"properties\":{\"to\":{\"type\":\"string\"}}}");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectList(any())).thenReturn(List.of(tool));
        com.mftb.admin.entity.AiToolPolicy policy = new com.mftb.admin.entity.AiToolPolicy();
        policy.setToolKey("email_sender");
        policy.setEnabled(1);
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of(policy));

        // 让第一轮 LLM 直接返回文本，无 tool_calls；只需捕获 tools schema
        Channel ch = channel();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(ch);
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        String resp = "{\"model\":\"m\",\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"hi\"}}]}";
        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        when(llmClient.chatCompletion(any(), any(), payloadCap.capture())).thenReturn(json(resp));

        OrchestrateResult out = svc.orchestrate(request("随便"), "alice");
        assertEquals("hi", out.getText());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> toolsSent = (List<Map<String, Object>>) payloadCap.getValue().get("tools");
        assertNotNull(toolsSent);
        List<String> names = toolsSent.stream()
                .map(t -> (String) ((Map<?, ?>) t.get("function")).get("name"))
                .toList();
        assertTrue(names.contains("query_account_balance"), "内建工具应在 schema 中");
        assertTrue(names.contains("email_sender"), "已授权外部工具应在 schema 中");
    }

    @Test
    void disabledExternalToolNotOffered() {
        AgentOrchestrationService svc = buildService();
        com.mftb.admin.entity.McpTool tool = new com.mftb.admin.entity.McpTool();
        tool.setToolKey("email_sender");
        tool.setParamsJson("{}");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectList(any())).thenReturn(List.of(tool));
        com.mftb.admin.entity.AiToolPolicy policy = new com.mftb.admin.entity.AiToolPolicy();
        policy.setToolKey("email_sender");
        policy.setEnabled(0);
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of(policy));

        Channel ch = channel();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(ch);
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        when(llmClient.chatCompletion(any(), any(), payloadCap.capture())).thenReturn(
                json("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));

        svc.orchestrate(request("x"), "alice");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> toolsSent = (List<Map<String, Object>>) payloadCap.getValue().get("tools");
        assertTrue(toolsSent.stream().noneMatch(t ->
                "email_sender".equals(((Map<?, ?>) t.get("function")).get("name"))),
                "未启用的外部工具不应下发");
    }

    /**
     * 试跑沙箱：必须用草稿 Prompt（systemPromptOverride），且不下发外部工具——
     * 否则「试跑」会真的调用外部服务，配置人员点一下预览就能给真实客户发邮件。
     */
    @Test
    void sandboxUsesDraftPromptAndHidesExternalTools() {
        AgentOrchestrationService svc = buildService();
        com.mftb.admin.entity.McpTool tool = new com.mftb.admin.entity.McpTool();
        tool.setToolKey("email_sender");
        tool.setParamsJson("{}");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectList(any())).thenReturn(List.of(tool));
        com.mftb.admin.entity.AiToolPolicy policy = new com.mftb.admin.entity.AiToolPolicy();
        policy.setToolKey("email_sender");
        policy.setEnabled(1);
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of(policy));
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        when(llmClient.chatCompletion(any(), any(), payloadCap.capture())).thenReturn(
                json("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));

        OrchestrateRequest req = request("試跑");
        req.setSandbox(true);
        req.setSystemPromptOverride("DRAFT-PROMPT");
        svc.orchestrate(req, "alice");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) payloadCap.getValue().get("messages");
        assertEquals("DRAFT-PROMPT", messages.get(0).get("content"), "试跑必须用草稿 Prompt，而不是线上已发布版本");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> toolsSent = (List<Map<String, Object>>) payloadCap.getValue().get("tools");
        assertNotNull(toolsSent);
        assertTrue(toolsSent.stream().noneMatch(t ->
                "email_sender".equals(((Map<?, ?>) t.get("function")).get("name"))),
                "沙箱不下发外部工具");
        assertTrue(toolsSent.stream().anyMatch(t ->
                "query_account_balance".equals(((Map<?, ?>) t.get("function")).get("name"))),
                "沙箱仍可验证内建只读工具");
    }

    /** disableTools=true 时不应再下发 tools，否则模型仍会尝试调工具，试跑结果不可比。 */
    @Test
    void disableToolsOmitsToolSchema() {
        AgentOrchestrationService svc = buildService();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        when(llmClient.chatCompletion(any(), any(), payloadCap.capture())).thenReturn(
                json("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));

        OrchestrateRequest req = request("不帶工具");
        req.setSandbox(true);
        req.setDisableTools(true);
        svc.orchestrate(req, "alice");

        assertNull(payloadCap.getValue().get("tools"), "禁用工具时不应下发 tools");
        verify(dummyTool, never()).execute(any(), any());
    }

    /** 输入护栏命中 block 时必须在调模型前返回，避免敏感内容进入上下文与计量。 */
    @Test
    void inputGuardrailBlocksBeforeLlmCall() {
        AgentOrchestrationService svc = buildService();
        when(guardrailService.checkInput(any(), any())).thenReturn(
                AiGuardrailService.GuardResult.block("input", "敏感詞"));

        OrchestrateResult out = svc.orchestrate(request("包含敏感詞"), "alice");

        assertEquals("guardrail_blocked", out.getErrorKind());
        assertTrue(out.getText().contains("不允許"), out.getText());
        verify(llmClient, never()).chatCompletion(any(), any(), any());
    }

    /** replace 动作要把改写后的输入交给模型，否则规则只是“提示”而没有生效。 */
    @Test
    void guardrailReplaceRewritesUserMessageBeforeLlm() {
        AgentOrchestrationService svc = buildService();
        when(guardrailService.checkInput(any(), any())).thenReturn(
                AiGuardrailService.GuardResult.ok("改寫後問題", List.of("已替換敏感內容")));
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        when(llmClient.chatCompletion(any(), any(), payloadCap.capture())).thenReturn(
                json("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));

        svc.orchestrate(request("原問題"), "alice");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) payloadCap.getValue().get("messages");
        assertEquals("改寫後問題", messages.get(messages.size() - 1).get("content"));
    }

    /** 角色不在 data_scope_json.roles 内时，工具不下发——否则“可见范围”只是一句提示。 */
    @Test
    void toolHiddenByRoleVisibility() {
        AgentOrchestrationService svc = buildService();
        com.mftb.admin.entity.AiToolPolicy policy = new com.mftb.admin.entity.AiToolPolicy();
        policy.setToolKey("query_account_balance");
        policy.setEnabled(1);
        policy.setDataScopeJson("{\"roles\":[\"rdm_pm\"]}");
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of(policy));
        com.mftb.admin.entity.SysUser user = new com.mftb.admin.entity.SysUser();
        user.setRole("user");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        when(llmClient.chatCompletion(any(), any(), payloadCap.capture())).thenReturn(
                json("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));

        svc.orchestrate(request("x"), "alice");

        assertNull(payloadCap.getValue().get("tools"), "无权限角色不应收到该工具的 schema");
    }

    /** 自动记忆候选：只随回答返回建议，不在服务端自动落库。 */
    @Test
    void memorySuggestionAttachedForExplicitPreference() {
        AgentOrchestrationService svc = buildService();
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), any())).thenReturn(channel());
        when(myCenterService.checkQuota(any(), any())).thenReturn(allowed());
        when(llmClient.chatCompletion(any(), any(), any())).thenReturn(
                json("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"好的\"}}]}"));
        when(memoryService.suggestFromMessage(any())).thenReturn("回答先給結論");

        OrchestrateResult out = svc.orchestrate(request("記住：回答先給結論"), "alice");

        assertEquals("回答先給結論", out.getMemorySuggestion());
    }
}

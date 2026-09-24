package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.service.AiConversationEventService;
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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §B.1：后端 tool 循环编排的关键路径（无渠道、额度拒绝、内建工具执行、外部工具 pending） */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AgentOrchestrationServiceTest {

    @Mock private LlmChannelRouter channelRouter;
    @Mock private AiMyCenterService myCenterService;
    @Mock private AiConversationEventService eventService;
    @Mock private RestTemplate restTemplate;
    @Mock private AgentTool dummyTool;
    @Mock private com.mftb.admin.mapper.McpToolMapper mcpToolMapper;
    @Mock private com.mftb.admin.mapper.AiToolPolicyMapper toolPolicyMapper;

    private final ObjectMapper mapper = new ObjectMapper();

    private AgentOrchestrationService buildService() {
        when(mcpToolMapper.selectList(any())).thenReturn(List.of());
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of());
        when(dummyTool.toolKey()).thenReturn("query_account_balance");
        when(dummyTool.description()).thenReturn("desc");
        when(dummyTool.schema()).thenReturn(Map.of("type", "object", "properties", Map.of()));
        return new AgentOrchestrationService(List.of(dummyTool), channelRouter, myCenterService,
                eventService, restTemplate, mapper, mcpToolMapper, toolPolicyMapper);
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
        verify(restTemplate, never()).exchange(any(String.class), any(HttpMethod.class), any(HttpEntity.class), eq(String.class));
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
        ResponseEntity<String> r1 = new ResponseEntity<>(round1, HttpStatus.OK);
        ResponseEntity<String> r2 = new ResponseEntity<>(round2, HttpStatus.OK);
        when(restTemplate.exchange(any(String.class), eq(HttpMethod.POST), any(HttpEntity.class), eq(String.class)))
                .thenReturn(r1, r2);
        when(dummyTool.execute(any(), any())).thenReturn("{\"total\":1}");

        OrchestrateResult out = svc.orchestrate(request("查一下余额"), "alice");
        assertEquals("余额 100", out.getText());
        assertEquals(38L, out.getTokens());
        verify(dummyTool, times(1)).execute(any(), any(ToolCallContext.class));
        // 事件：USER_TURN + TOOL_CALL + TOOL_RESULT + ASSISTANT_TURN
        ArgumentCaptor<String> typeCap = ArgumentCaptor.forClass(String.class);
        verify(eventService, times(4)).append(any(), any(), typeCap.capture(), any(), any());
        assertEquals(List.of("USER_TURN", "TOOL_CALL", "TOOL_RESULT", "ASSISTANT_TURN"),
                typeCap.getAllValues());
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
        when(restTemplate.exchange(any(String.class), eq(HttpMethod.POST), any(HttpEntity.class), eq(String.class)))
                .thenReturn(new ResponseEntity<>(body, HttpStatus.OK));

        OrchestrateResult out = svc.orchestrate(request("发邮件"), "alice");
        assertNotNull(out.getPendingExternalCalls());
        assertEquals(1, out.getPendingExternalCalls().size());
        Map<?, ?> first = (Map<?, ?>) out.getPendingExternalCalls().get(0);
        assertEquals("email_sender", first.get("name"));
        verify(dummyTool, never()).execute(any(), any());
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
        ArgumentCaptor<HttpEntity> entityCap = ArgumentCaptor.forClass(HttpEntity.class);
        when(restTemplate.exchange(any(String.class), eq(HttpMethod.POST), entityCap.capture(), eq(String.class)))
                .thenReturn(new ResponseEntity<>(resp, HttpStatus.OK));

        OrchestrateResult out = svc.orchestrate(request("随便"), "alice");
        assertEquals("hi", out.getText());

        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) entityCap.getValue().getBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> toolsSent = (List<Map<String, Object>>) payload.get("tools");
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
        ArgumentCaptor<HttpEntity> entityCap = ArgumentCaptor.forClass(HttpEntity.class);
        when(restTemplate.exchange(any(String.class), eq(HttpMethod.POST), entityCap.capture(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("{\"model\":\"m\",\"choices\":[{\"message\":{\"content\":\"ok\"}}]}", HttpStatus.OK));

        svc.orchestrate(request("x"), "alice");
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) entityCap.getValue().getBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> toolsSent = (List<Map<String, Object>>) payload.get("tools");
        assertTrue(toolsSent.stream().noneMatch(t ->
                "email_sender".equals(((Map<?, ?>) t.get("function")).get("name"))),
                "未启用的外部工具不应下发");
    }
}

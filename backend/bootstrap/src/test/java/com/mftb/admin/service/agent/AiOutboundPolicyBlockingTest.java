package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiGuardRuleMapper;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiConversationService;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 无分类与批准端点证据时，任何模型入口都必须阻断且不得预占或发送。 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiOutboundPolicyBlockingTest {
    @Mock private AiMyCenterService myCenter;
    @Mock private AiKillSwitchService killSwitch;
    @Mock private OperatorResolver operator;
    @Mock private PermissionService permissions;
    @Mock private AiGuardRuleMapper guardRuleMapper;
    @Mock private AiConfigAuditService audit;
    @Mock private LlmChannelRouter router;
    @Mock private AgentTool tool;
    @Mock private AiConversationEventService events;
    @Mock private AiConversationService conversations;
    @Mock private LlmHttpClient client;
    @Mock private LlmMeteringService metering;
    @Mock private com.mftb.admin.mapper.McpToolMapper mcpToolMapper;
    @Mock private com.mftb.admin.mapper.AiToolPolicyMapper toolPolicyMapper;
    @Mock private com.mftb.admin.service.AiToolPolicyService toolPolicyService;
    @Mock private AiPromptConfigService promptConfig;
    @Mock private AiUserMemoryService memory;
    @Mock private com.mftb.admin.service.agent.platform.AiApplicationService applications;
    @Mock private com.mftb.admin.service.agent.platform.AiDataPolicyService dataPolicy;

    private AgentOrchestrationService orchestration;
    private AiModelAdmissionService admission;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        SysUser user = new SysUser();
        user.setUsername("alice");
        user.setStatus(1);
        when(operator.currentUser()).thenReturn(user);
        when(operator.currentOperatorAccount()).thenReturn("alice");
        when(permissions.hasSystemAccess(any(), any())).thenReturn(true);
        when(myCenter.hasModelAccess(any())).thenReturn(true);
        when(myCenter.checkQuota(any(), any())).thenReturn(allowed());
        when(toolPolicyService.enforce(any(), any(), any(), any())).thenReturn(new com.mftb.admin.entity.AiToolPolicy());
        when(tool.toolKey()).thenReturn("query_account_balance");
        when(tool.schema()).thenReturn(Map.of("type", "object"));
        when(tool.description()).thenReturn("d");
        when(mcpToolMapper.selectList(any())).thenReturn(List.of());
        when(toolPolicyMapper.selectList(any())).thenReturn(List.of(enablePolicy()));
        AiGuardrailService guardrails = new AiGuardrailService(guardRuleMapper, audit);
        when(dataPolicy.evaluate(any(), any())).thenReturn(
                new com.mftb.admin.service.agent.platform.AiDataPolicyService.Decision(
                        false, "data_class_unclassified", "該業務系統尚未分級，禁止發送模型"));
        admission = new AiModelAdmissionService(myCenter, killSwitch, operator, permissions,
                new AiOutboundPolicyService(guardrails, dataPolicy));
        orchestration = new AgentOrchestrationService(List.of(tool), router, admission, events, client, mapper,
                metering, conversations, mcpToolMapper, toolPolicyMapper, toolPolicyService, promptConfig,
                operator, guardrails, memory, applications);
    }

    private static com.mftb.admin.entity.AiToolPolicy enablePolicy() {
        var p = new com.mftb.admin.entity.AiToolPolicy();
        p.setToolKey("query_account_balance");
        p.setEnabled(1);
        p.setRequireApproval(0);
        return p;
    }

    private static AiMyCenterDTO.QuotaCheckVO allowed() {
        var q = new AiMyCenterDTO.QuotaCheckVO();
        q.setAllowed(true);
        q.setAction("allow");
        return q;
    }

    private static LlmChannelRouter.Channel channel() {
        var c = new LlmChannelRouter.Channel();
        c.setLabel("primary");
        c.setBaseUrl("https://model.example.test");
        c.setApiKey("test-only");
        c.setDefaultModelKey("model");
        return c;
    }

    @Test
    void orchestrationStopsBeforeReservationWithoutApprovedEndpoint() {
        when(router.resolveChannel(any(), any())).thenReturn(channel());
        var req = new AgentOrchestrationService.OrchestrateRequest();
        req.setMessages(List.of(Map.of("role", "user", "content", "查一下餘額")));
        req.setSystemCode("finance");

        var out = orchestration.orchestrate(req, "alice");

        assertEquals("data_class_unclassified", out.getErrorKind());
        verify(metering, never()).reserve(any(), any(), any(), anyInt(), anyInt());
        verify(client, never()).chatCompletion(any(), any(), any());
        verify(tool, never()).executeRich(any(), any());
    }

    @Test
    void guardrailReadFailureBlocksInsteadOfPassing() {
        when(guardRuleMapper.selectList(any())).thenThrow(new IllegalStateException("db down"));
        AiGuardrailService guardrails = new AiGuardrailService(guardRuleMapper, audit);
        assertTrue(guardrails.checkInput("隨便一句", "common").isBlocked());
    }

    @Test
    void guardrailReplaceIsWhatGetsSentNotOriginal() {
        var rule = new com.mftb.admin.entity.AiGuardRule();
        rule.setRuleType("keyword");
        rule.setAction("replace");
        rule.setPattern("機密");
        rule.setReplacement("[已脫敏]");
        rule.setScope("input");
        rule.setSystemCode("common");
        rule.setEnabled(1);
        when(guardRuleMapper.selectList(any())).thenReturn(List.of(rule));
        AiGuardrailService guardrails = new AiGuardrailService(guardRuleMapper, audit);

        var result = guardrails.checkInput("這是機密內容", "common");

        assertFalse(result.isBlocked());
        assertEquals("這是[已脫敏]內容", result.getText());
    }

    @Test
    void guardrailUnknownActionBlocks() {
        var rule = new com.mftb.admin.entity.AiGuardRule();
        rule.setRuleType("keyword");
        rule.setAction("silently-ignore");
        rule.setPattern("薪資");
        rule.setScope("input");
        rule.setSystemCode("common");
        rule.setEnabled(1);
        when(guardRuleMapper.selectList(any())).thenReturn(List.of(rule));
        assertTrue(new AiGuardrailService(guardRuleMapper, audit).checkInput("薪資表", "common").isBlocked());
    }

    @Test
    void crossSystemAccessIsDeniedBeforeModelAuthorization() {
        when(permissions.hasSystemAccess(any(), eq("eam"))).thenReturn(false);
        var decision = admission.checkContext("alice", "eam");
        assertEquals("system_access_denied", decision.errorKind());
        verify(myCenter, never()).hasModelAccess(any());
    }
}

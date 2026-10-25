package com.mftb.admin.service.impl;

import com.mftb.admin.entity.AiToolExecLog;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.McpToolMapper;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.service.McpExternalHandler;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §B.2：MCP 网关在调用 handler 之前必须经过 ai_tool_policy 拦截，且写入审计 */
@ExtendWith(MockitoExtension.class)
class McpExecServiceImplPolicyTest {

    @Mock private McpToolMapper mcpToolMapper;
    @Mock private OperatorResolver operatorResolver;
    @Mock private AiToolPolicyService policyService;
    @Mock private AiConversationEventService eventService;
    @Mock private AiKillSwitchService killSwitchService;
    @Mock private McpExternalHandler emailHandler;

    /** 会话归属由事件服务核验；本类只验证策略与审计顺序，统一给出已归属的编号。 */
    private void ownedConversation() {
        ownedConversation("DH01");
    }

    private void ownedConversation(String number) {
        org.mockito.Mockito.lenient().when(eventService.requireOwned(any(), anyString())).thenReturn(number);
    }

    @Test
    void policyEnforcedBeforeHandlerAndToolLookup() {
        ownedConversation();
        when(operatorResolver.currentOperatorAccount()).thenReturn("alice");
        AiToolPolicy ok = new AiToolPolicy();
        ok.setToolKey("send_email");
        when(policyService.enforce(eq("send_email"), any(), eq("alice"), anyString(), any())).thenReturn(ok);
        when(emailHandler.toolKey()).thenReturn("send_email");

        McpTool tool = new McpTool();
        tool.setToolKey("send_email");
        tool.setName("邮件发送");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectOne(any())).thenReturn(tool);
        when(emailHandler.execute(any(), any())).thenReturn("SENT");

        McpExecServiceImpl svc = new McpExecServiceImpl(
                mcpToolMapper, operatorResolver, policyService, eventService, killSwitchService,
                org.mockito.Mockito.mock(com.mftb.admin.service.agent.platform.AiActionProposalService.class), List.of(emailHandler));

        String result = svc.execute("send_email", Map.of("to", "a@b.c"), "token-1", "DH01");
        assertEquals("SENT", result);

        verify(policyService).enforce(eq("send_email"), eq("token-1"), eq("alice"), anyString(), any());
        verify(emailHandler).execute(any(), any());

        // 审计一次落库，decision=allow，success=1
        ArgumentCaptor<AiToolExecLog> cap = ArgumentCaptor.forClass(AiToolExecLog.class);
        verify(policyService).logExecution(cap.capture());
        assertEquals("allow", cap.getValue().getDecision());
        assertEquals(1, cap.getValue().getSuccess());
        assertNotNull(cap.getValue().getArgsDigest());
        assertEquals("DH01", cap.getValue().getConversationId());
    }

    @Test
    void enforceFailureShortCircuitsBeforeHandler() {
        when(operatorResolver.currentOperatorAccount()).thenReturn("alice");
        when(policyService.enforce(any(), any(), any(), any(), any()))
                .thenThrow(new IllegalArgumentException("工具未授权"));
        when(emailHandler.toolKey()).thenReturn("send_email");

        McpExecServiceImpl svc = new McpExecServiceImpl(
                mcpToolMapper, operatorResolver, policyService, eventService, killSwitchService,
                org.mockito.Mockito.mock(com.mftb.admin.service.agent.platform.AiActionProposalService.class), List.of(emailHandler));

        assertThrows(IllegalArgumentException.class,
                () -> svc.execute("send_email", Map.of("to", "a@b.c")));
        verify(mcpToolMapper, never()).selectOne(any());
        verify(emailHandler, never()).execute(any(), any());
    }

    @Test
    void handlerFailureStillAuditsAsFailed() {
        when(operatorResolver.currentOperatorAccount()).thenReturn("bob");
        when(emailHandler.toolKey()).thenReturn("send_email");
        when(policyService.enforce(any(), any(), any(), any(), any())).thenReturn(new AiToolPolicy());
        McpTool tool = new McpTool();
        tool.setToolKey("send_email");
        tool.setName("邮件发送");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectOne(any())).thenReturn(tool);
        when(emailHandler.execute(any(), any())).thenThrow(new RuntimeException("SMTP 500"));

        McpExecServiceImpl svc = new McpExecServiceImpl(
                mcpToolMapper, operatorResolver, policyService, eventService, killSwitchService,
                org.mockito.Mockito.mock(com.mftb.admin.service.agent.platform.AiActionProposalService.class), List.of(emailHandler));

        assertThrows(RuntimeException.class,
                () -> svc.execute("send_email", Map.of("to", "a@b.c")));

        ArgumentCaptor<AiToolExecLog> cap = ArgumentCaptor.forClass(AiToolExecLog.class);
        verify(policyService, times(1)).logExecution(cap.capture());
        assertEquals("allow", cap.getValue().getDecision());
        assertEquals(0, cap.getValue().getSuccess());
        assertNotNull(cap.getValue().getRejectReason());
    }

    @Test
    void writesToolEventsWhenConversationPkProvided() {
        ownedConversation("DH99");
        when(operatorResolver.currentOperatorAccount()).thenReturn("carol");
        when(policyService.enforce(any(), any(), any(), any(), any())).thenReturn(new AiToolPolicy());
        when(emailHandler.toolKey()).thenReturn("send_email");
        McpTool tool = new McpTool();
        tool.setToolKey("send_email");
        tool.setName("邮件发送");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectOne(any())).thenReturn(tool);
        when(emailHandler.execute(any(), any())).thenReturn("OK");

        McpExecServiceImpl svc = new McpExecServiceImpl(
                mcpToolMapper, operatorResolver, policyService, eventService, killSwitchService,
                org.mockito.Mockito.mock(com.mftb.admin.service.agent.platform.AiActionProposalService.class), List.of(emailHandler));

        svc.execute("send_email", Map.of("to", "a@b.c"), "tok", "DH99", 123L);

        // 至少 3 次：POLICY_DECISION allow / TOOL_CALL / TOOL_RESULT success=1
        verify(eventService, org.mockito.Mockito.atLeast(3)).append(eq(123L), eq(null), any(), eq("carol"), any());
    }

    @Test
    void skipsEventsWhenConversationPkNull() {
        ownedConversation();
        when(operatorResolver.currentOperatorAccount()).thenReturn("dave");
        when(policyService.enforce(any(), any(), any(), any(), any())).thenReturn(new AiToolPolicy());
        when(emailHandler.toolKey()).thenReturn("send_email");
        McpTool tool = new McpTool();
        tool.setToolKey("send_email");
        tool.setSource("external");
        tool.setInstalled(1);
        when(mcpToolMapper.selectOne(any())).thenReturn(tool);
        when(emailHandler.execute(any(), any())).thenReturn("OK");

        McpExecServiceImpl svc = new McpExecServiceImpl(
                mcpToolMapper, operatorResolver, policyService, eventService, killSwitchService,
                org.mockito.Mockito.mock(com.mftb.admin.service.agent.platform.AiActionProposalService.class), List.of(emailHandler));

        svc.execute("send_email", Map.of("to", "a@b.c"));

        verify(eventService, never()).append(any(), any(), any(), any(), any());
    }

    @Test
    void killSwitchBlocksBeforePolicy() {
        ownedConversation();
        when(killSwitchService.isEngaged()).thenReturn(true);
        when(operatorResolver.currentOperatorAccount()).thenReturn("zed");
        when(emailHandler.toolKey()).thenReturn("send_email");

        McpExecServiceImpl svc = new McpExecServiceImpl(
                mcpToolMapper, operatorResolver, policyService, eventService, killSwitchService,
                org.mockito.Mockito.mock(com.mftb.admin.service.agent.platform.AiActionProposalService.class), List.of(emailHandler));

        assertThrows(IllegalStateException.class,
                () -> svc.execute("send_email", Map.of("to", "x@y.z")));
        // 熔断时短路，不调用 policy.enforce、不查 mcp_tool、不跑 handler
        verify(policyService, never()).enforce(any(), any(), any(), any(), any());
        verify(mcpToolMapper, never()).selectOne(any());
        verify(emailHandler, never()).execute(any(), any());

        ArgumentCaptor<AiToolExecLog> cap = ArgumentCaptor.forClass(AiToolExecLog.class);
        verify(policyService).logExecution(cap.capture());
        assertEquals("reject", cap.getValue().getDecision());
        assertEquals("kill_switch_engaged", cap.getValue().getRejectReason());
    }
}

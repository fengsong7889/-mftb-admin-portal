package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.service.agent.AgentOrchestrationService;
import com.mftb.admin.service.agent.AgentOrchestrationService.OrchestrateResult;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** WP06 过渡执行器与 WP07 内建工具提案执行：领取、取消、冻结参数与回执。 */
class AgentRunWorkerAndActionExecutionTest {

    private JdbcTemplate jdbc;
    private AgentRunService runs;
    private AgentOrchestrationService orchestration;
    private SysUserMapper users;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        jdbc = mock(JdbcTemplate.class);
        runs = mock(AgentRunService.class);
        orchestration = mock(AgentOrchestrationService.class);
        users = mock(SysUserMapper.class);
        when(users.selectOne(any())).thenReturn(activeUser("alice"));
        SecurityContextHolder.clearContext();
    }

    private SysUser activeUser(String username) {
        SysUser user = new SysUser();
        user.setId(9L);
        user.setUsername(username);
        user.setStatus(1);
        return user;
    }

    @Test
    void workerDoesNothingWhenQueueEmpty() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(1);
        when(runs.claimNext(anyString(), anyInt())).thenReturn(null);
        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();
        verify(orchestration, never()).orchestrate(any(), any());
        verify(runs, never()).finish(anyLong(), any(), any(), any());
    }

    @Test
    void workerSkipsQueueWhenPlatformNotConfigured() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(0);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(0);
        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();
        verify(runs, never()).claimNext(anyString(), anyInt());
        verify(orchestration, never()).orchestrate(any(), any());
    }

    @Test
    void workerClaimsAndCompletesQueuedRun() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(1);
        when(runs.claimNext(anyString(), anyInt())).thenReturn(5L, (Long) null);
        Map<String, Object> row = new HashMap<>();
        row.put("id", 5L);
        row.put("requester", "alice");
        row.put("system_code", "rdm");
        row.put("application_key", null);
        row.put("conversation_pk", null);
        row.put("input_json", "{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}");
        when(jdbc.queryForMap(contains("FROM ai_run"), eq(5L))).thenReturn(row);
        when(runs.cancelRequested(5L)).thenReturn(false);
        when(runs.addStep(eq(5L), eq(1), eq("MODEL"), isNull(), isNull(), anyString())).thenReturn(11L);
        OrchestrateResult ok = new OrchestrateResult();
        ok.setText("done");
        when(orchestration.orchestrate(any(), eq("alice"))).thenReturn(ok);

        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();

        verify(runs).finishStep(eq(11L), eq(true), eq("ok"), anyLong());
        verify(runs).finish(eq(5L), eq("succeeded"), isNull(), eq("done"));
    }

    private Map<String, Object> runRow(long id, String requester) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", id);
        row.put("requester", requester);
        row.put("system_code", "ai");
        row.put("app_key", null);
        row.put("app_version", null);
        row.put("conversation_pk", null);
        row.put("input_json", "{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}");
        return row;
    }

    @Test
    void workerHonoursCancelBeforeModelCall() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(1);
        when(runs.claimNext(anyString(), anyInt())).thenReturn(6L, (Long) null);
        Map<String, Object> row = new HashMap<>();
        row.put("id", 6L);
        row.put("requester", "alice");
        row.put("input_json", "{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}");
        when(jdbc.queryForMap(contains("FROM ai_run"), eq(6L))).thenReturn(row);
        when(runs.cancelRequested(6L)).thenReturn(true);

        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();

        verify(orchestration, never()).orchestrate(any(), any());
        verify(runs).finish(eq(6L), eq("cancelled"), eq("cancel_requested"), isNull());
    }

    @Test
    void workerFailsWhenRequesterMissing() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(1);
        when(runs.claimNext(anyString(), anyInt())).thenReturn(7L, (Long) null);
        when(jdbc.queryForMap(contains("FROM ai_run"), eq(7L))).thenReturn(runRow(7L, "ghost"));
        when(users.selectOne(any())).thenReturn(null);

        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();

        verify(orchestration, never()).orchestrate(any(), any());
        verify(runs).finish(eq(7L), eq("failed"), eq("requester_unavailable"), isNull());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void workerFailsWhenRequesterDisabled() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(1);
        when(runs.claimNext(anyString(), anyInt())).thenReturn(8L, (Long) null);
        when(jdbc.queryForMap(contains("FROM ai_run"), eq(8L))).thenReturn(runRow(8L, "alice"));
        SysUser disabled = activeUser("alice");
        disabled.setStatus(0);
        when(users.selectOne(any())).thenReturn(disabled);

        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();

        verify(orchestration, never()).orchestrate(any(), any());
        verify(runs).finish(eq(8L), eq("failed"), eq("requester_unavailable"), isNull());
    }

    @Test
    void workerInjectsRequesterIdentityAndClearsItAfterwards() {
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(1);
        when(runs.claimNext(anyString(), anyInt())).thenReturn(9L, (Long) null);
        when(jdbc.queryForMap(contains("FROM ai_run"), eq(9L))).thenReturn(runRow(9L, "alice"));
        when(runs.cancelRequested(9L)).thenReturn(false);
        when(runs.addStep(eq(9L), eq(1), eq("MODEL"), isNull(), isNull(), anyString())).thenReturn(12L);
        AtomicReference<Object> principal = new AtomicReference<>();
        AtomicReference<Object> details = new AtomicReference<>();
        when(orchestration.orchestrate(any(), eq("alice"))).thenAnswer(invocation -> {
            // 编排层靠 SecurityContext 取当前操作人；这里断言后台线程确实拿到了发起人身份
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            assertNotNull(authentication, "后台执行必须注入发起人身份");
            principal.set(authentication.getPrincipal());
            details.set(authentication.getDetails());
            OrchestrateResult result = new OrchestrateResult();
            result.setText("ok");
            return result;
        });

        AgentRunWorker worker = new AgentRunWorker(jdbc, mapper, runs, orchestration, users);
        org.springframework.test.util.ReflectionTestUtils.setField(worker, "enabled", true);
        worker.poll();

        assertEquals("alice", principal.get());
        assertTrue(details.get() instanceof SysUser);
        assertEquals("alice", ((SysUser) details.get()).getUsername());
        // 线程池复用：执行结束必须清空上下文，否则下一个任务会继承上一个发起人
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(runs).finish(eq(9L), eq("succeeded"), isNull(), eq("ok"));
    }

    @Test
    void executionUsesFrozenParamsAndRecordsReceipt() {
        OperatorResolver operators = mock(OperatorResolver.class);
        SysUser user = new SysUser();
        user.setId(7L);
        user.setUsername("alice");
        user.setStatus(1);
        when(operators.currentUser()).thenReturn(user);
        AiActionProposalService proposals = mock(AiActionProposalService.class);
        when(proposals.get("AP-1")).thenReturn(new HashMap<>(Map.of("requester", "alice", "tool_key", "query_approvals")));
        when(proposals.rawParams("AP-1")).thenReturn("{\"flowStatus\":\"pending\"}");
        when(proposals.canonicalJson(any())).thenReturn("{\"flowStatus\":\"pending\"}");
        when(proposals.sha256(any())).thenReturn("hash");
        when(proposals.consume("AP-1", "alice", "query_approvals", "hash"))
                .thenReturn(new AiActionProposalService.Consumed(3L, "AP-1", "query_approvals", "{}"));
        AiToolPolicyService policies = mock(AiToolPolicyService.class);
        AiToolPolicy policy = new AiToolPolicy();
        policy.setToolKey("query_approvals");
        policy.setEnabled(1);
        when(policies.find("query_approvals")).thenReturn(policy);
        AgentTool tool = mock(AgentTool.class);
        when(tool.toolKey()).thenReturn("query_approvals");
        when(tool.execute(any(), any())).thenReturn("{\"total\":1}");

        var service = new AgentActionExecutionService(List.of(tool), proposals, policies, operators, mapper);
        Map<String, Object> result = service.executeApproved("AP-1", "alice");

        assertEquals(true, result.get("success"));
        verify(tool).execute(argThat(args -> "pending".equals(args.get("flowStatus"))), any());
        verify(proposals).recordReceipt(eq(3L), eq("accepted"), isNull(), eq("executed"), isNull());
    }

    @Test
    void disabledToolBlocksExecutionBeforeConsume() {
        OperatorResolver operators = mock(OperatorResolver.class);
        SysUser user = new SysUser();
        user.setId(7L);
        user.setUsername("alice");
        user.setStatus(1);
        when(operators.currentUser()).thenReturn(user);
        AiActionProposalService proposals = mock(AiActionProposalService.class);
        when(proposals.get("AP-2")).thenReturn(new HashMap<>(Map.of("requester", "alice", "tool_key", "query_approvals")));
        AiToolPolicyService policies = mock(AiToolPolicyService.class);
        AiToolPolicy disabled = new AiToolPolicy();
        disabled.setToolKey("query_approvals");
        disabled.setEnabled(0);
        when(policies.find("query_approvals")).thenReturn(disabled);
        AgentTool tool = mock(AgentTool.class);
        when(tool.toolKey()).thenReturn("query_approvals");

        var service = new AgentActionExecutionService(List.of(tool), proposals, policies, operators, mapper);
        assertThrows(BusinessException.class, () -> service.executeApproved("AP-2", "alice"));
        verify(proposals, never()).consume(any(), any(), any(), any());
        verify(tool, never()).execute(any(), any());
    }

    @Test
    void foreignProposalCannotBeExecuted() {
        OperatorResolver operators = mock(OperatorResolver.class);
        SysUser user = new SysUser();
        user.setId(7L);
        user.setUsername("alice");
        user.setStatus(1);
        when(operators.currentUser()).thenReturn(user);
        AiActionProposalService proposals = mock(AiActionProposalService.class);
        when(proposals.get("AP-3")).thenReturn(new HashMap<>(Map.of("requester", "bob", "tool_key", "query_approvals")));

        var service = new AgentActionExecutionService(List.of(), proposals, mock(AiToolPolicyService.class),
                operators, mapper);
        assertThrows(BusinessException.class, () -> service.executeApproved("AP-3", "alice"));
    }
}

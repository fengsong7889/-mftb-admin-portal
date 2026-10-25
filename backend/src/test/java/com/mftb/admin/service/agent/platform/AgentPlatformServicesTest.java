package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 平台核心服务的确定性行为：哈希一致性、分区拒绝、预算原子条件与运行取消语义。 */
class AgentPlatformServicesTest {

    private JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        jdbc = mock(JdbcTemplate.class);
    }

    /* ── 动作提案 ── */

    @Test
    void canonicalJsonIsKeyOrderIndependent() {
        var service = new AiActionProposalService(jdbc, mapper);
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("b", 2);
        a.put("a", Map.of("y", 1, "x", 2));
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("a", Map.of("x", 2, "y", 1));
        b.put("b", 2);
        assertEquals(service.canonicalJson(a), service.canonicalJson(b));
        assertEquals(service.sha256("x").length(), 64);
    }

    @Test
    void prepareReusesIdempotentProposal() {
        var service = new AiActionProposalService(jdbc, mapper);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("proposal_no", "AP-EXIST", "status", "pending", "expires_at", "2030-01-01 00:00:00")));
        Map<String, Object> result = service.prepare("send_email", Map.of("to", "a@b.c"), "alice", null, null, null, 30);
        assertEquals("AP-EXIST", result.get("proposalNo"));
        assertEquals(true, result.get("reused"));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void consumeRejectsForeignRequesterAndWrongParams() {
        var service = new AiActionProposalService(jdbc, mapper);
        Map<String, Object> row = new HashMap<>();
        row.put("id", 1L);
        row.put("proposal_no", "AP-1");
        row.put("status", "approved");
        row.put("requester", "alice");
        row.put("tool_key", "send_email");
        row.put("params_hash", "hash");
        row.put("params_json", "{}");
        row.put("expires_at", java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().plusMinutes(5)));
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row));

        assertThrows(BusinessException.class, () -> service.consume("AP-1", "bob", "send_email", "hash"));
        assertThrows(BusinessException.class, () -> service.consume("AP-1", "alice", "send_email", "other"));
    }

    @Test
    void consumeIsOneTimeAndExpires() {
        var service = new AiActionProposalService(jdbc, mapper);
        Map<String, Object> row = new HashMap<>();
        row.put("id", 1L);
        row.put("status", "approved");
        row.put("requester", "alice");
        row.put("tool_key", "send_email");
        row.put("params_hash", "hash");
        row.put("params_json", "{}");
        row.put("expires_at", java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().plusMinutes(5)));
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.consume("AP-1", "alice", "send_email", "hash"));

        row.put("expires_at", java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().minusMinutes(1)));
        assertThrows(BusinessException.class, () -> service.consume("AP-1", "alice", "send_email", "hash"));
    }

    /* ── 数据分级与端点 ── */

    @Test
    void unclassifiedSystemIsDenied() {
        when(jdbc.queryForList(contains("ai_data_class_policy"), eq(String.class), anyString())).thenReturn(List.of());
        var service = new AiDataPolicyService(jdbc);
        var decision = service.evaluate("hr", "model-a");
        assertFalse(decision.allowed());
        assertEquals("data_class_unclassified", decision.errorKind());
    }

    @Test
    void endpointLevelMustCoverSystemLevel() {
        when(jdbc.queryForList(contains("ai_data_class_policy"), eq(String.class), anyString()))
                .thenReturn(List.of("SENSITIVE"));
        when(jdbc.queryForList(contains("ai_endpoint_approval"), eq("model-a")))
                .thenReturn(List.of(Map.of("max_data_class", "INTERNAL", "status", 1)));
        var service = new AiDataPolicyService(jdbc);
        var decision = service.evaluate("hr", "model-a");
        assertFalse(decision.allowed());
        assertEquals("data_class_exceeded", decision.errorKind());

        when(jdbc.queryForList(contains("ai_endpoint_approval"), eq("model-a")))
                .thenReturn(List.of(Map.of("max_data_class", "SENSITIVE", "status", 1)));
        assertTrue(service.evaluate("hr", "model-a").allowed());
    }

    @Test
    void revokedEndpointIsRejected() {
        when(jdbc.queryForList(contains("ai_data_class_policy"), eq(String.class), anyString()))
                .thenReturn(List.of("PUBLIC"));
        when(jdbc.queryForList(contains("ai_endpoint_approval"), eq("model-a")))
                .thenReturn(List.of(Map.of("max_data_class", "PUBLIC", "status", 0)));
        assertEquals("endpoint_disabled", new AiDataPolicyService(jdbc).evaluate("common", "model-a").errorKind());
    }

    /* ── 预算池 ── */

    @Test
    void missingPoolFallsBackToExistingQuota() {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        assertTrue(new AiBudgetPoolService(jdbc).tryReserve("USER", "alice", "2026-10", "CNY", BigDecimal.TEN));
    }

    @Test
    void fullPoolDeniesReservation() {
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 3L, "limit_amount", BigDecimal.TEN, "reserved_amount", BigDecimal.TEN, "used_amount", BigDecimal.ZERO)));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(0);
        assertFalse(new AiBudgetPoolService(jdbc).tryReserve("USER", "alice", "2026-10", "CNY", BigDecimal.ONE));
    }

    /* ── 应用 ── */

    @Test
    void applicationKeyMustBeStableLowercase() {
        var service = new AiApplicationService(jdbc, mapper);
        assertThrows(BusinessException.class, () -> service.save(Map.of("appKey", "Bad Key", "name", "x"), "admin"));
        assertThrows(BusinessException.class, () -> service.save(Map.of("appKey", "ok-key"), "admin"));
    }

    @Test
    void unpublishedApplicationHasNoTools() {
        var service = new AiApplicationService(jdbc, mapper);
        assertTrue(service.toolWhitelist(null).isEmpty());
        assertTrue(service.toolWhitelist(Map.of("tool_whitelist_json", "not-json")).isEmpty());
        assertEquals(List.of("query_account_balance"),
                service.toolWhitelist(Map.of("tool_whitelist_json", "[\"query_account_balance\"]")));
    }

    /* ── 运行 ── */

    @Test
    void cancelRejectsFinishedRun() {
        var service = new AgentRunService(jdbc, mapper);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 1L, "run_no", "RUN1", "requester", "alice", "status", "succeeded")));
        assertThrows(BusinessException.class, () -> service.cancel("RUN1", "alice"));
    }

    @Test
    void otherUsersRunIsNotReadable() {
        var service = new AgentRunService(jdbc, mapper);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 1L, "run_no", "RUN1", "requester", "bob", "status", "running")));
        assertThrows(BusinessException.class, () -> service.get("RUN1", "alice"));
    }
}

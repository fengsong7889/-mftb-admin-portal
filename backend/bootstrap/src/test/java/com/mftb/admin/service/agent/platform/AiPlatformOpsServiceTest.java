package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** WP09/WP10：规则试算与评测必须复用同一策略服务，且不调用模型。 */
class AiPlatformOpsServiceTest {

    @Test
    void evaluatePolicyNeverClaimsModelCall() {
        var jdbc = mock(JdbcTemplate.class);
        var dataPolicy = mock(AiDataPolicyService.class);
        when(dataPolicy.dataClassOf("hr")).thenReturn("SENSITIVE");
        when(dataPolicy.evaluate("hr", "model-a"))
                .thenReturn(new AiDataPolicyService.Decision(false, "endpoint_not_approved", "端點未批准"));
        var service = new AiPlatformOpsService(jdbc, dataPolicy, mock(AiKnowledgeAclService.class), new ObjectMapper());

        Map<String, Object> result = service.evaluatePolicy("hr", "model-a");

        assertEquals(false, result.get("modelCalled"));
        assertEquals("SENSITIVE", result.get("dataClass"));
        assertEquals("endpoint_not_approved", ((Map<?, ?>) result.get("decision")).get("reason"));
    }

    @Test
    void evalRunBlocksReleaseWhenSecurityCaseMismatches() {
        var jdbc = mock(JdbcTemplate.class);
        var dataPolicy = mock(AiDataPolicyService.class);
        when(dataPolicy.evaluate(eq("hr"), isNull()))
                .thenReturn(new AiDataPolicyService.Decision(false, "data_class_unclassified", "未分級"));
        when(jdbc.queryForList(contains("FROM ai_eval_case"), any(Object[].class)))
                .thenReturn(List.of(Map.of("case_no", "HR-01", "system_code", "hr", "must_pass", 1,
                        "expect_json", "{\"allowed\":true}")));
        var service = new AiPlatformOpsService(jdbc, dataPolicy, mock(AiKnowledgeAclService.class), new ObjectMapper());

        Map<String, Object> result = service.runDataset("hr-safety", "hr-assistant", "qa");

        assertEquals(1, result.get("failed"));
        assertEquals(true, result.get("blocking"));
    }

    @Test
    void readinessListsBlockingItems() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("ai_data_class_policy"), eq(Integer.class))).thenReturn(0);
        when(jdbc.queryForObject(contains("ai_endpoint_approval"), eq(Integer.class))).thenReturn(0);
        when(jdbc.queryForObject(contains("ai_knowledge_acl"), eq(Integer.class))).thenReturn(0);
        when(jdbc.queryForObject(contains("ai_application"), eq(Integer.class))).thenReturn(0);
        var service = new AiPlatformOpsService(jdbc, mock(AiDataPolicyService.class),
                mock(AiKnowledgeAclService.class), new ObjectMapper());
        org.springframework.test.util.ReflectionTestUtils.setField(service, "workerEnabled", false);

        Map<String, Object> result = service.readiness();

        assertEquals(false, result.get("readyForModelCalls"));
        assertEquals(List.of("data_class_missing", "endpoint_not_approved",
                "knowledge_acl_missing", "application_not_published"), result.get("blocking"));
    }

    @Test
    void matchingExpectationPassesWithoutModel() {
        var jdbc = mock(JdbcTemplate.class);
        var dataPolicy = mock(AiDataPolicyService.class);
        when(dataPolicy.evaluate(eq("hr"), isNull()))
                .thenReturn(new AiDataPolicyService.Decision(false, "data_class_unclassified", "未分級"));
        when(jdbc.queryForList(contains("FROM ai_eval_case"), any(Object[].class)))
                .thenReturn(List.of(Map.of("case_no", "HR-02", "system_code", "hr", "must_pass", 1,
                        "expect_json", "{\"allowed\":false}")));
        var service = new AiPlatformOpsService(jdbc, dataPolicy, mock(AiKnowledgeAclService.class), new ObjectMapper());

        Map<String, Object> result = service.runDataset("hr-safety", null, "qa");

        assertEquals(1, result.get("passed"));
        assertEquals(false, result.get("blocking"));
    }
}

package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.service.agent.tool.AgentTool;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * RDM 工具契约：toolKey 唯一、schema 是合法 object、描述非空。
 *
 * <p>这些工具依赖的服务不参与 schema 生成，构造时传 null 即可；
 * 真正执行路径的权限/数据范围由各 service 的测试覆盖。
 */
class RdmToolSchemaTest {

    private List<AgentTool> tools() {
        return List.of(
                new RdmListProjectsTool(null, null),
                new RdmProjectProgressTool(null, null),
                new RdmListIterationsTool(null, null),
                new RdmQueryRequirementsTool(null, null),
                new RdmRequirementDetailTool(null, null),
                new RdmMyTodosTool(null, null),
                new RdmPersonWorkloadTool(null, null),
                new RdmStatsOverviewTool(null, null),
                new RdmRisksTool(null, null),
                new RdmListTasksTool(null, null, null),
                new RdmPrepareProgressPushTool(null, null, null));
    }

    @Test
    @DisplayName("toolKey 唯一且全部以 rdm_ 开头")
    void toolKeysAreUniqueAndNamespaced() {
        Set<String> keys = new HashSet<>();
        for (AgentTool tool : tools()) {
            assertTrue(tool.toolKey().startsWith("rdm_"), tool.toolKey());
            assertTrue(keys.add(tool.toolKey()), "重复 toolKey: " + tool.toolKey());
        }
        assertEquals(11, keys.size());
    }

    @Test
    @DisplayName("schema 是 object，description 非空")
    @SuppressWarnings("unchecked")
    void schemasAreValid() {
        for (AgentTool tool : tools()) {
            Map<String, Object> schema = tool.schema();
            assertNotNull(schema, tool.toolKey());
            assertEquals("object", schema.get("type"), tool.toolKey());
            assertNotNull(schema.get("properties"), tool.toolKey());
            assertFalse(tool.description() == null || tool.description().isBlank(), tool.toolKey());
        }
    }

    @Test
    @DisplayName("推送工具的必填参数包含 project 与 targetType")
    @SuppressWarnings("unchecked")
    void pushToolRequiresProjectAndTarget() {
        AgentTool push = tools().stream()
                .filter(t -> "rdm_prepare_progress_push".equals(t.toolKey()))
                .findFirst().orElseThrow();
        Map<String, Object> schema = push.schema();
        List<String> required = (List<String>) schema.get("required");
        assertNotNull(required);
        assertTrue(required.contains("project"));
        assertTrue(required.contains("targetType"));
    }
}

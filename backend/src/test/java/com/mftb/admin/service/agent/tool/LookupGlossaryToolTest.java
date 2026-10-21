package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiGlossary;
import com.mftb.admin.service.agent.AiPromptConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 术语按需检索工具：命中生成表格，未命中明确提示不要编造。 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LookupGlossaryToolTest {

    @Mock private AiPromptConfigService promptConfigService;

    private final ObjectMapper mapper = new ObjectMapper();
    private LookupGlossaryTool tool;

    @BeforeEach
    void setUp() {
        tool = new LookupGlossaryTool(promptConfigService, mapper);
    }

    private static AiGlossary glossary() {
        AiGlossary row = new AiGlossary();
        row.setTerm("交付項");
        row.setDomain("rdm");
        row.setDefinition("需求下的交付單元");
        row.setFormula("完成數/總數");
        return row;
    }

    @Test
    @DisplayName("命中时返回定义/口径与表格视图")
    void returnsHitsAndView() {
        when(promptConfigService.searchGlossary(eq("交付項"), eq("rdm"), eq(5)))
                .thenReturn(List.of(glossary()));

        AgentTool.RichOutput out = tool.executeRich(
                Map.of("keyword", "交付項", "domain", "rdm"), new AgentTool.ToolCallContext("alice", null));

        assertNotNull(out.view());
        assertEquals("術語與口徑", out.view().getTitle());
        assertEquals(1, out.view().getRows().size());
        assertTrue(out.content().contains("需求下的交付單元"));
    }

    @Test
    @DisplayName("未命中时提示不要编造，不生成空表格")
    void missAsksNotToFabricate() throws Exception {
        when(promptConfigService.searchGlossary(any(), any(), anyInt())).thenReturn(List.of());

        AgentTool.RichOutput out = tool.executeRich(
                Map.of("keyword", "不存在"), new AgentTool.ToolCallContext("alice", null));

        JsonNode json = mapper.readTree(out.content());
        assertEquals(0, json.path("total").asInt());
        assertTrue(json.path("hint").asText().contains("不要自行編造口徑"));
        assertNull(out.view());
    }

    @Test
    @DisplayName("缺少关键词时返回错误 JSON，不查库")
    void blankKeywordReturnsError() throws Exception {
        AgentTool.RichOutput out = tool.executeRich(Map.of(), new AgentTool.ToolCallContext("alice", null));

        assertTrue(mapper.readTree(out.content()).has("error"));
        verify(promptConfigService, org.mockito.Mockito.never()).searchGlossary(any(), any(), anyInt());
    }
}

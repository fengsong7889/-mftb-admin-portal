package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.service.agent.AiKnowledgeService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 知识库工具：命中时返回可引用片段 + 表格视图；未命中时明确提示不要编造。 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SearchKnowledgeToolTest {

    @Mock private AiKnowledgeService knowledgeService;

    private final ObjectMapper mapper = new ObjectMapper();
    private SearchKnowledgeTool tool;

    @BeforeEach
    void setUp() {
        tool = new SearchKnowledgeTool(knowledgeService, mapper);
    }

    @Test
    @DisplayName("命中时返回标题与片段，并生成知识库表格视图")
    void returnsHitsAndView() {
        when(knowledgeService.search(eq("日報"), eq("rdm"), eq(5))).thenReturn(List.of(
                new AiKnowledgeService.KnowledgeHit(1L, 0, "日報推送規範", "rdm", "每日 09:00 推送", 1.5)));

        AgentTool.RichOutput out = tool.executeRich(Map.of("query", "日報", "systemCode", "rdm"),
                new AgentTool.ToolCallContext("alice", null));

        assertNotNull(out.view());
        assertEquals("知識庫檢索結果", out.view().getTitle());
        assertEquals(1, out.view().getRows().size());
        assertTrue(out.content().contains("日報推送規範"));
        assertTrue(out.content().contains("每日 09:00 推送"));
    }

    @Test
    @DisplayName("未命中时提示不要编造，且不生成空表格")
    void emptyHitsAsksNotToFabricate() throws Exception {
        when(knowledgeService.search(any(), any(), anyInt())).thenReturn(List.of());

        AgentTool.RichOutput out = tool.executeRich(Map.of("query", "不存在的主題"),
                new AgentTool.ToolCallContext("alice", null));

        JsonNode json = mapper.readTree(out.content());
        assertEquals(0, json.path("total").asInt());
        assertTrue(json.path("hint").asText().contains("不要編造"));
        assertNull(out.view());
    }

    @Test
    @DisplayName("缺少检索词时返回错误 JSON，不抛异常")
    void blankQueryReturnsError() throws Exception {
        AgentTool.RichOutput out = tool.executeRich(Map.of(), new AgentTool.ToolCallContext("alice", null));

        assertTrue(mapper.readTree(out.content()).has("error"));
        verify(knowledgeService, org.mockito.Mockito.never()).search(any(), any(), anyInt());
    }
}

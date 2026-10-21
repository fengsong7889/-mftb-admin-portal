package com.mftb.admin.service.agent;

import com.mftb.admin.entity.AiKnowledgeDoc;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiCapabilityMapper;
import com.mftb.admin.mapper.AiConfigChangeLogMapper;
import com.mftb.admin.mapper.AiGlossaryMapper;
import com.mftb.admin.mapper.AiGuardRuleMapper;
import com.mftb.admin.mapper.AiKnowledgeDocMapper;
import com.mftb.admin.mapper.AiPromptProfileMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** 概览：只返回有 view 权限的模块，无权限模块不泄露计数。 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiAssistantOverviewServiceTest {

    @Mock private PermissionService permissionService;
    @Mock private OperatorResolver operatorResolver;
    @Mock private AiCapabilityMapper capabilityMapper;
    @Mock private AiPromptProfileMapper profileMapper;
    @Mock private AiGlossaryMapper glossaryMapper;
    @Mock private AiKnowledgeDocMapper knowledgeDocMapper;
    @Mock private AiGuardRuleMapper guardRuleMapper;
    @Mock private AiConfigChangeLogMapper changeLogMapper;
    @Mock private AiFeedbackService feedbackService;

    private AiAssistantOverviewService service;

    @BeforeEach
    void setUp() {
        service = new AiAssistantOverviewService(permissionService, operatorResolver,
                capabilityMapper, profileMapper, glossaryMapper, knowledgeDocMapper,
                guardRuleMapper, changeLogMapper, feedbackService);
        SysUser user = new SysUser();
        user.setId(9L);
        when(operatorResolver.currentUser()).thenReturn(user);
        when(permissionService.hasPermission(any(), eq("ai-assistant-knowledge"), eq("view"))).thenReturn(true);
        when(permissionService.hasPermission(any(), eq("ai-assistant-feedback"), eq("view"))).thenReturn(true);
        for (String key : List.of("ai-assistant-capability", "ai-assistant-profile", "ai-assistant-glossary",
                "ai-assistant-guardrail", "ai-assistant-audit")) {
            when(permissionService.hasPermission(any(), eq(key), eq("view"))).thenReturn(false);
        }
        AiKnowledgeDoc doc = new AiKnowledgeDoc();
        doc.setChunkCount(4);
        when(knowledgeDocMapper.selectList(any())).thenReturn(List.of(doc));
        when(feedbackService.stats(30)).thenReturn(Map.of("total", 12L, "downRate", 25d));
    }

    @Test
    @DisplayName("只返回知识库与回答质量卡片，其他模块不出现")
    void filtersAreasByPermission() {
        Map<String, Object> out = service.overview();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> areas = (List<Map<String, Object>>) out.get("areas");
        assertEquals(2, areas.size());
        assertEquals("ai-assistant-knowledge", areas.get(0).get("key"));
        assertEquals("ai-assistant-feedback", areas.get(1).get("key"));
        assertFalse(areas.stream().anyMatch(a -> "ai-assistant-capability".equals(a.get("key"))));
        assertEquals(false, out.get("canViewAudit"));
        @SuppressWarnings("unchecked")
        List<?> changes = (List<?>) out.get("recentChanges");
        assertTrue(changes.isEmpty());
    }
}

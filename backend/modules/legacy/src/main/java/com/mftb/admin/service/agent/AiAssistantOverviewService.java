package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.AiCapability;
import com.mftb.admin.entity.AiConfigChangeLog;
import com.mftb.admin.entity.AiGlossary;
import com.mftb.admin.entity.AiGuardRule;
import com.mftb.admin.entity.AiKnowledgeDoc;
import com.mftb.admin.entity.AiPromptProfile;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiCapabilityMapper;
import com.mftb.admin.mapper.AiConfigChangeLogMapper;
import com.mftb.admin.mapper.AiGlossaryMapper;
import com.mftb.admin.mapper.AiGuardRuleMapper;
import com.mftb.admin.mapper.AiKnowledgeDocMapper;
import com.mftb.admin.mapper.AiPromptProfileMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 助手概览：只返回当前用户有 view 权限的模块，避免“卡片看得见、点进去 403”。
 *
 * <p>一个接口聚合 6 个模块的轻量计数，避免概览页发 6 个请求；
 * 计数只做 selectCount/轻量查询，不拉列表正文。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiAssistantOverviewService {

    private final PermissionService permissionService;
    private final OperatorResolver operatorResolver;
    private final AiCapabilityMapper capabilityMapper;
    private final AiPromptProfileMapper profileMapper;
    private final AiGlossaryMapper glossaryMapper;
    private final AiKnowledgeDocMapper knowledgeDocMapper;
    private final AiGuardRuleMapper guardRuleMapper;
    private final AiConfigChangeLogMapper changeLogMapper;
    private final AiFeedbackService feedbackService;

    public Map<String, Object> overview() {
        SysUser user = operatorResolver.currentUser();
        List<Map<String, Object>> areas = new ArrayList<>();
        List<Map<String, Object>> issues = new ArrayList<>();

        if (can(user, "ai-assistant-capability")) {
            long count = count(capabilityMapper.selectCount(new LambdaQueryWrapper<AiCapability>()));
            areas.add(area("ai-assistant-capability", "能力清單", "工具能力說明與適用場景",
                    count, "項能力", "/ai-assistant/capability"));
        }
        if (can(user, "ai-assistant-profile")) {
            long active = count(profileMapper.selectCount(new LambdaQueryWrapper<AiPromptProfile>()
                    .eq(AiPromptProfile::getStatus, "active")));
            long draft = count(profileMapper.selectCount(new LambdaQueryWrapper<AiPromptProfile>()
                    .eq(AiPromptProfile::getStatus, "draft")));
            areas.add(area("ai-assistant-profile", "回答骨架", "發布版本與草稿",
                    active, "套已發布", "/ai-assistant/profile"));
            if (draft > 0) issues.add(issue("warning", "有 " + draft + " 套回答骨架草稿尚未發布", "/ai-assistant/profile"));
        }
        if (can(user, "ai-assistant-glossary")) {
            long count = count(glossaryMapper.selectCount(new LambdaQueryWrapper<AiGlossary>()));
            areas.add(area("ai-assistant-glossary", "術語與口徑", "業務術語與統計口徑",
                    count, "條術語", "/ai-assistant/glossary"));
        }
        if (can(user, "ai-assistant-knowledge")) {
            List<AiKnowledgeDoc> docs = knowledgeDocMapper.selectList(new LambdaQueryWrapper<AiKnowledgeDoc>()
                    .eq(AiKnowledgeDoc::getStatus, "active"));
            long chunks = docs.stream().mapToLong(d -> d.getChunkCount() == null ? 0 : d.getChunkCount()).sum();
            areas.add(area("ai-assistant-knowledge", "知識庫", "規範、說明與字段口徑",
                    docs.size(), "篇已啟用 / " + chunks + " 分塊", "/ai-assistant/knowledge"));
            long empty = docs.stream().filter(d -> d.getChunkCount() == null || d.getChunkCount() == 0).count();
            if (empty > 0) issues.add(issue("warning", "有 " + empty + " 篇知識庫文檔沒有分塊，檢索不到", "/ai-assistant/knowledge"));
        }
        if (can(user, "ai-assistant-guardrail")) {
            long enabled = count(guardRuleMapper.selectCount(new LambdaQueryWrapper<AiGuardRule>()
                    .eq(AiGuardRule::getEnabled, 1)));
            long total = count(guardRuleMapper.selectCount(new LambdaQueryWrapper<AiGuardRule>()));
            areas.add(area("ai-assistant-guardrail", "合規護欄", "輸入/輸出攔截、替換與提醒",
                    enabled, "條啟用 / 共 " + total + " 條", "/ai-assistant/guardrail"));
            if (total == 0) issues.add(issue("info", "尚未配置合規護欄，輸入輸出不做內容攔截", "/ai-assistant/guardrail"));
        }
        if (can(user, "ai-assistant-feedback")) {
            Map<String, Object> stats = feedbackService.stats(30);
            Object downRate = stats.get("downRate");
            areas.add(area("ai-assistant-feedback", "回答質量", "近 30 天贊/踩與低分原因",
                    stats.get("total"), "次反饋 / 差評率 " + downRate + "%", "/ai-assistant/feedback"));
            if (downRate instanceof Number number && number.doubleValue() >= 30) {
                issues.add(issue("warning", "近 30 天差評率 " + downRate + "%，建議查看低分工具與原因", "/ai-assistant/feedback"));
            }
        }

        List<Map<String, Object>> recentChanges = new ArrayList<>();
        if (can(user, "ai-assistant-audit")) {
            List<AiConfigChangeLog> logs = changeLogMapper.selectList(new LambdaQueryWrapper<AiConfigChangeLog>()
                    .orderByDesc(AiConfigChangeLog::getId).last("LIMIT 5"));
            for (AiConfigChangeLog row : logs) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", row.getId());
                item.put("configType", row.getConfigType());
                item.put("configKey", row.getConfigKey());
                item.put("action", row.getAction());
                item.put("operator", row.getOperator());
                item.put("createdAt", row.getCreatedAt());
                recentChanges.add(item);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("areas", areas);
        out.put("issues", issues);
        out.put("recentChanges", recentChanges);
        out.put("canViewAudit", can(user, "ai-assistant-audit"));
        return out;
    }

    private boolean can(SysUser user, String menuKey) {
        try {
            return permissionService.hasPermission(user, menuKey, "view");
        } catch (Exception e) {
            log.warn("[AiAssistantOverview] 权限判断失败 menu={}: {}", menuKey, e.getMessage());
            return false;
        }
    }

    private static long count(Long value) {
        return value == null ? 0 : value;
    }

    private static Map<String, Object> area(String key, String title, String description,
                                            Object value, String unit, String route) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("key", key);
        map.put("title", title);
        map.put("description", description);
        map.put("value", value);
        map.put("unit", unit);
        map.put("route", route);
        return map;
    }

    private static Map<String, Object> issue(String tone, String text, String route) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tone", tone);
        map.put("text", text);
        map.put("route", route);
        return map;
    }
}

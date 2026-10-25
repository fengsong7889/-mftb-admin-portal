package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.service.agent.AiKnowledgeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 知识库检索工具：只读，返回文档标题 + 片段，供模型引用。
 *
 * <p>结果同时生成 {@link AgentView}，让前端展示“依据了哪几篇文档”，
 * 避免模型把知识库内容改写成没有出处的结论。
 */
@Component
@RequiredArgsConstructor
public class SearchKnowledgeTool implements AgentTool {

    private final AiKnowledgeService knowledgeService;
    private final ObjectMapper objectMapper;
    private final com.mftb.admin.util.OperatorResolver operatorResolver;

    @Override
    public String toolKey() {
        return "search_knowledge";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("type", "string");
        query.put("description", "檢索關鍵詞或問題");
        Map<String, Object> systemCode = new LinkedHashMap<>();
        systemCode.put("type", "string");
        systemCode.put("description", "可選：限定系統 common/rdm/finance/eam/hr");
        Map<String, Object> limit = new LinkedHashMap<>();
        limit.put("type", "integer");
        limit.put("description", "返回條數，默認 5，最多 10");
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("query", query);
        properties.put("systemCode", systemCode);
        properties.put("limit", limit);
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", List.of("query"));
        return schema;
    }

    @Override
    public String description() {
        return "檢索管理後台知識庫（使用說明、流程規範、字段口徑），返回文檔標題與相關片段";
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        return executeRich(args, ctx).content();
    }

    @Override
    public RichOutput executeRich(Map<String, Object> args, ToolCallContext ctx) {
        String query = args == null ? "" : String.valueOf(args.getOrDefault("query", ""));
        if (!StringUtils.hasText(query)) {
            return RichOutput.of("{\"error\":\"請提供檢索關鍵詞\"}");
        }
        String systemCode = args.get("systemCode") == null ? null : String.valueOf(args.get("systemCode"));
        int limit = 5;
        Object rawLimit = args.get("limit");
        if (rawLimit instanceof Number number) limit = number.intValue();
        else if (rawLimit != null) {
            try {
                limit = Integer.parseInt(String.valueOf(rawLimit));
            } catch (NumberFormatException ignored) {
                limit = 5;
            }
        }
        List<AiKnowledgeService.KnowledgeHit> hits;
        try {
            com.mftb.admin.entity.SysUser user = operatorResolver.currentUser();
            if (user == null) return RichOutput.of("{\"error\":\"未取得登錄身份\",\"errorKind\":\"unauthorized\"}");
            hits = knowledgeService.search(query, systemCode, limit, user);
        } catch (com.mftb.admin.common.BusinessException denied) {
            return RichOutput.of("{\"error\":\"知識檢索失敗\",\"errorKind\":\"knowledge_search_denied\"}");
        }
        if (hits.isEmpty()) {
            return RichOutput.of("{\"total\":0,\"hint\":\"知識庫未檢索到相關內容，請如實說明未收錄，不要編造\"}");
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (AiKnowledgeService.KnowledgeHit hit : hits) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("docId", hit.getDocId());
            item.put("title", hit.getTitle());
            item.put("systemCode", hit.getSystemCode());
            item.put("snippet", hit.getSnippet());
            item.put("score", hit.getScore());
            items.add(item);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("total", items.size());
        payload.put("items", items);
        payload.put("hint", "引用時請標明文檔標題；片段可能不完整，必要時說明以原文為準");
        String content;
        try {
            content = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            content = "{\"total\":0}";
        }
        return new RichOutput(content, view(query, items), null);
    }

    private AgentView view(String query, List<Map<String, Object>> items) {
        AgentView v = new AgentView();
        v.setId("search_knowledge:" + query);
        v.setKind("table");
        v.setTitle("知識庫檢索結果");
        v.setSubtitle("僅檢索已啟用的知識庫文檔");
        AgentView.Column title = new AgentView.Column();
        title.setKey("title");
        title.setTitle("文檔");
        title.setWidth(200);
        title.setType("text");
        AgentView.Column system = new AgentView.Column();
        system.setKey("systemCode");
        system.setTitle("系統");
        system.setWidth(100);
        system.setType("tag");
        AgentView.Column snippet = new AgentView.Column();
        snippet.setKey("snippet");
        snippet.setTitle("相關片段");
        snippet.setType("text");
        v.getColumns().add(title);
        v.getColumns().add(system);
        v.getColumns().add(snippet);
        for (int i = 0; i < items.size() && i < 10; i++) {
            v.getRows().add(items.get(i));
        }
        AgentView.Note note = new AgentView.Note();
        note.setTone("info");
        note.setText("知識庫未收錄的問題請如實說明，不要編造");
        v.getNotes().add(note);
        v.setTotal(items.size());
        return v;
    }
}

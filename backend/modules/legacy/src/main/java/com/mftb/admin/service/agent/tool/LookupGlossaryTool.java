package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.AiGlossary;
import com.mftb.admin.service.agent.AiPromptConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 术语按需检索工具：术语量变大后不把全部术语塞进 System Prompt，
 * 由模型在遇到不熟悉的词时主动查，降低 token 与串味风险。
 *
 * <p>只读，结果同时生成表格视图，便于前端展示“这次引用了哪条口径”。
 */
@Component
@RequiredArgsConstructor
public class LookupGlossaryTool implements AgentTool {

    private final AiPromptConfigService promptConfigService;
    private final ObjectMapper objectMapper;

    @Override
    public String toolKey() {
        return "lookup_glossary";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> keyword = new LinkedHashMap<>();
        keyword.put("type", "string");
        keyword.put("description", "術語、別名或口徑關鍵詞");
        Map<String, Object> domain = new LinkedHashMap<>();
        domain.put("type", "string");
        domain.put("description", "可選：限定領域 common/rdm/finance/eam/hr");
        Map<String, Object> limit = new LinkedHashMap<>();
        limit.put("type", "integer");
        limit.put("description", "返回條數，默認 5，最多 10");
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("keyword", keyword);
        properties.put("domain", domain);
        properties.put("limit", limit);
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", List.of("keyword"));
        return schema;
    }

    @Override
    public String description() {
        return "按關鍵詞查詢術語與統計口徑（術語/別名/定義/公式）";
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        return executeRich(args, ctx).content();
    }

    @Override
    public RichOutput executeRich(Map<String, Object> args, ToolCallContext ctx) {
        String keyword = args == null ? "" : String.valueOf(args.getOrDefault("keyword", ""));
        if (!StringUtils.hasText(keyword)) {
            return RichOutput.of("{\"error\":\"請提供術語關鍵詞\"}");
        }
        String domain = args.get("domain") == null ? null : String.valueOf(args.get("domain"));
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
        List<AiGlossary> rows = promptConfigService.searchGlossary(keyword, domain, limit);
        if (rows.isEmpty()) {
            return RichOutput.of("{\"total\":0,\"hint\":\"未收錄該術語；請如實說明未找到，不要自行編造口徑\"}");
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (AiGlossary row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("term", row.getTerm());
            item.put("domain", row.getDomain());
            item.put("aliases", row.getAliases());
            item.put("definition", row.getDefinition());
            item.put("formula", row.getFormula());
            item.put("example", row.getExample());
            items.add(item);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("total", items.size());
        payload.put("items", items);
        payload.put("hint", "回答時按術語定義與口徑解釋；不要改寫數字口徑");
        String content;
        try {
            content = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            content = "{\"total\":0}";
        }
        return new RichOutput(content, view(keyword, items), null);
    }

    private AgentView view(String keyword, List<Map<String, Object>> items) {
        AgentView v = new AgentView();
        v.setId("lookup_glossary:" + keyword);
        v.setKind("table");
        v.setTitle("術語與口徑");
        v.setSubtitle("僅返回已啟用的術語");
        AgentView.Column term = new AgentView.Column();
        term.setKey("term");
        term.setTitle("術語");
        term.setWidth(160);
        term.setType("text");
        AgentView.Column domain = new AgentView.Column();
        domain.setKey("domain");
        domain.setTitle("領域");
        domain.setWidth(90);
        domain.setType("tag");
        AgentView.Column definition = new AgentView.Column();
        definition.setKey("definition");
        definition.setTitle("定義/口徑");
        definition.setType("text");
        v.getColumns().add(term);
        v.getColumns().add(domain);
        v.getColumns().add(definition);
        for (int i = 0; i < items.size() && i < 10; i++) {
            v.getRows().add(items.get(i));
        }
        AgentView.Note note = new AgentView.Note();
        note.setTone("info");
        note.setText("未收錄的術語請如實說明，不要編造口徑");
        v.getNotes().add(note);
        v.setTotal(items.size());
        return v;
    }
}

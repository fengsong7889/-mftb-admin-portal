package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 我的待办：待我审批 / 待我处理 / 待我验收 / 待分配。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmMyTodosTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmRequirementService requirementService;

    @Override
    public String toolKey() {
        return "rdm_my_todos";
    }

    @Override
    public String description() {
        return "查詢與當前用戶相關的待辦：待我審批（准入審批）、待我處理（產品/研發/驗收）、待我驗收、待分配（僅有分配權者）";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("type", Map.of("type", "string", "description", "待辦類型",
                "enum", List.of("approval", "todo", "acceptance", "pool", "all")));
        props.put("limit", Map.of("type", "integer", "description", "每類返回行數，默認 5，最多 10"));
        return Map.of("type", "object", "properties", props);
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        return executeRich(args, ctx).content();
    }

    @Override
    public RichOutput executeRich(Map<String, Object> args, ToolCallContext ctx) {
        return run(args, ctx);
    }

    private RichOutput run(Map<String, Object> args, ToolCallContext ctx) {
        SysUser user = support.currentUser();
        String denied = support.requireAny(user,
                "rdm-workbench:view", "rdm-requirement:view", "rdm-acceptance:view");
        if (denied != null) return RichOutput.of(denied);

        String type = support.argStr(args, "type");
        if (type == null) type = "all";
        int limit = support.limit(args, 5, 10);
        boolean canPool = support.canSeeAll(user);

        List<Row> rows = new ArrayList<>();
        Map<String, Long> counts = new LinkedHashMap<>();
        List<String> skipped = new ArrayList<>();

        if ("all".equals(type) || "approval".equals(type)) {
            collect("待我審批", RdmConstants.SCOPE_APPROVING, limit, rows, counts, skipped);
        }
        if ("all".equals(type) || "todo".equals(type)) {
            collect("待我處理", RdmConstants.SCOPE_TODO, limit, rows, counts, skipped);
        }
        if ("all".equals(type) || "acceptance".equals(type)) {
            collect("待我驗收", RdmConstants.SCOPE_ACCEPTANCE, limit, rows, counts, skipped);
        }
        if ("all".equals(type) || "pool".equals(type)) {
            if (canPool) {
                collect("待分配", RdmConstants.SCOPE_POOL, limit, rows, counts, skipped);
            } else {
                counts.put("待分配", 0L);
                skipped.add("待分配需分配權限，已跳過");
            }
        }
        if (!"all".equals(type) && !List.of("approval", "todo", "acceptance", "pool").contains(type)) {
            return RichOutput.of(support.error("不支持的待辦類型：" + type,
                    "可用值：approval / todo / acceptance / pool / all"));
        }

        String hint = support.scopeHint(user);
        AgentView view = support.view("rdm_my_todos:" + type, "我的待辦", hint);
        long total = counts.values().stream().mapToLong(Long::longValue).sum();
        view.setTotal((int) total);
        counts.forEach((k, v) -> {
            String tone = v > 0 ? ("待我審批".equals(k) ? "warning" : "processing") : "default";
            view.getMetrics().add(support.metric(k, v, "條", tone));
        });
        view.getColumns().add(support.column("type", "類型", "tag", 100));
        view.getColumns().add(support.column("reqNo", "需求編號", "text", 140));
        view.getColumns().add(support.column("title", "標題", "text", 220));
        view.getColumns().add(support.column("status", "狀態", "tag", 110));
        view.getColumns().add(support.column("project", "項目", "text", 140));
        view.getColumns().add(support.column("handler", "處理人", "text", 100));
        view.getColumns().add(support.column("updatedAt", "更新時間", "text", 150));
        List<Map<String, Object>> viewRows = new ArrayList<>();
        for (Row r : rows) {
            viewRows.add(support.row(
                    "type", r.type,
                    "reqNo", r.reqNo,
                    "title", support.truncate(r.title, 60),
                    "status", r.status,
                    "project", r.project,
                    "handler", r.handler,
                    "updatedAt", r.updatedAt));
        }
        view.setRows(viewRows);
        if (skipped.isEmpty()) {
            view.getNotes().add(support.note("info", "口徑：" + hint));
        } else {
            view.getNotes().add(support.note("warning", String.join("；", skipped)));
        }
        view.setLink(support.link("進入個人工作台", "/rdm-workbench"));

        List<Map<String, Object>> records = new ArrayList<>();
        for (Row r : rows) {
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("類型", r.type);
            rec.put("需求編號", r.reqNo);
            rec.put("標題", r.title);
            rec.put("狀態", r.status);
            rec.put("項目", r.project);
            rec.put("處理人", r.handler);
            rec.put("更新時間", r.updatedAt);
            records.add(rec);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("counts", counts);
        content.put("returned", records.size());
        content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
        content.put("records", records);
        if (!skipped.isEmpty()) content.put("skipped", skipped);
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }

    private void collect(String type, String scope, int limit,
                         List<Row> rows, Map<String, Long> counts, List<String> skipped) {
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setPage(1);
        query.setSize(limit);
        query.setScope(scope);
        try {
            PageResult<RdmRequirementVO> page = requirementService.page(query);
            counts.put(type, page.getTotal() == null ? 0L : page.getTotal());
            if (page.getRecords() != null) {
                for (RdmRequirementVO r : page.getRecords()) {
                    rows.add(new Row(type, r.getReqNo(), r.getTitle(),
                            support.requirementStatusLabel(r.getStatus()), r.getProjectName(),
                            r.getCurrentHandler(), r.getUpdatedAt()));
                }
            }
        } catch (Exception e) {
            log.warn("[RdmMyTodos] {} 查询失败: {}", type, e.getMessage());
            counts.put(type, 0L);
            skipped.add(type + " 查詢失敗，請稍後重試");
        }
    }

    private record Row(String type, String reqNo, String title, String status,
                       String project, String handler, String updatedAt) {
    }
}

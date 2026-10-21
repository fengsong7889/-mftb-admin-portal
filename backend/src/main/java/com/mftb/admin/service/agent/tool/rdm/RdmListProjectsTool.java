package com.mftb.admin.service.agent.tool.rdm;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.RdmProjectDTO;
import com.mftb.admin.dto.RdmProjectVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmProjectService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 项目列表查询：回答“有哪些项目 / 进行中的项目 / 某人负责的项目 / 逾期风险项目”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmListProjectsTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmProjectService projectService;

    @Override
    public String toolKey() {
        return "rdm_list_projects";
    }

    @Override
    public String description() {
        return "查詢產研交付的項目清單（籌備中/進行中/部分交付/全部交付/已關閉），可按項目經理、逾期、風險篩選";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("keyword", Map.of("type", "string", "description", "項目名稱或編號關鍵字"));
        props.put("status", Map.of("type", "string",
                "description", "精確項目狀態",
                "enum", List.of("preparing", "in_progress", "partial_delivered", "all_delivered", "closed")));
        props.put("statusGroup", Map.of("type", "string",
                "description", "語義狀態組：active=進行中，delivered=全部交付，closed=已關閉，all=全部",
                "enum", List.of("active", "delivered", "closed", "all")));
        props.put("pm", Map.of("type", "string", "description", "項目經理姓名或工號（模糊匹配）"));
        props.put("riskOnly", Map.of("type", "boolean", "description", "只看風險項目"));
        props.put("overdueOnly", Map.of("type", "boolean", "description", "只看逾期項目"));
        props.put("limit", Map.of("type", "integer", "description", "返回行數，默認 10，最多 20"));
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
                "rdm-dashboard-project:view", "rdm-requirement:view_all");
        if (denied != null) return RichOutput.of(denied);

        RdmProjectDTO.Query query = new RdmProjectDTO.Query();
        query.setKeyword(support.argStr(args, "keyword"));
        String status = support.argStr(args, "status");
        if (status == null) {
            String group = support.argStr(args, "statusGroup");
            status = switch (group == null ? "" : group) {
                case "active" -> "in_progress";
                case "delivered" -> "all_delivered";
                case "closed" -> "closed";
                default -> null;
            };
        }
        query.setStatus(status);
        String pm = support.argStr(args, "pm");
        if (pm != null) {
            RdmToolSupport.PersonLookup person = support.resolvePerson(pm);
            if (!person.ok()) return RichOutput.of(lookupError(person.error(), person.hint(), person.candidates()));
            query.setPmUserId(person.user().getId());
        }
        int limit = support.limit(args, 10, 20);
        // 风险/逾期没有服务端筛选参数：项目量级小，取一批后在内存过滤，再截断
        boolean riskOnly = support.argBool(args, "riskOnly");
        boolean overdueOnly = support.argBool(args, "overdueOnly");
        query.setPageNo(1);
        query.setPageSize(riskOnly || overdueOnly ? Math.min(200, Math.max(limit * 5, 20)) : limit);

        Page<RdmProjectVO.ListItem> page;
        try {
            page = projectService.listProjects(query, user == null ? null : user.getId());
        } catch (Exception e) {
            log.warn("[RdmListProjects] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢項目失敗", "請稍後再試或縮小查詢範圍"));
        }
        List<RdmProjectVO.ListItem> items = page.getRecords() == null ? List.of() : page.getRecords();
        if (riskOnly) {
            items = items.stream().filter(i -> i.getRiskFlag() != null && i.getRiskFlag() == 1).toList();
        }
        if (overdueOnly) {
            items = items.stream().filter(i -> i.getOverdueFlag() != null && i.getOverdueFlag() == 1).toList();
        }
        if (items.size() > limit) items = items.subList(0, limit);

        String hint = support.scopeHint(user);
        if (items.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("ok", true);
            empty.put("total", 0);
            empty.put("returned", 0);
            empty.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
            empty.put("records", List.of());
            empty.put("message", "未找到符合條件的項目");
            AgentView view = support.view("rdm_list_projects:empty", "項目查詢", hint);
            view.getNotes().add(support.note("info", "未找到符合條件的項目，可嘗試放寬關鍵字或狀態。"));
            return new RichOutput(support.json(empty), view, null);
        }

        List<Map<String, Object>> records = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        int overdue = 0;
        int risk = 0;
        int inProgress = 0;
        for (RdmProjectVO.ListItem item : items) {
            String statusLabel = support.projectStatusLabel(item.getStatus());
            String delivery = support.progressText(
                    item.getDeliveredCount() == null ? 0 : item.getDeliveredCount(),
                    item.getTotalDeliveryCount() == null ? 0 : item.getTotalDeliveryCount());
            boolean isOverdue = item.getOverdueFlag() != null && item.getOverdueFlag() == 1;
            boolean isRisk = item.getRiskFlag() != null && item.getRiskFlag() == 1;
            if (isOverdue) overdue++;
            if (isRisk) risk++;
            if ("進行中".equals(statusLabel)) inProgress++;
            String marks = (isOverdue ? "⚠逾期 " : "") + (isRisk ? "⚠風險" : "");
            marks = marks.trim();

            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("項目編號", item.getProjectNo());
            rec.put("項目名稱", item.getName());
            rec.put("項目經理", item.getPmUserName());
            rec.put("產品負責人", item.getProductOwnerUserName());
            rec.put("計劃結束", item.getPlanEndDate());
            rec.put("交付進度", delivery);
            rec.put("需求數", item.getRequirementTotal());
            rec.put("狀態", statusLabel);
            rec.put("標記", marks);
            records.add(rec);

            rows.add(support.row(
                    "projectNo", item.getProjectNo(),
                    "name", item.getName(),
                    "pm", item.getPmUserName(),
                    "productOwner", item.getProductOwnerUserName(),
                    "planEnd", item.getPlanEndDate(),
                    "delivery", delivery,
                    "requirements", item.getRequirementTotal(),
                    "status", statusLabel,
                    "marks", marks));
        }

        AgentView view = support.view("rdm_list_projects", "項目查詢", hint);
        view.setTotal((int) page.getTotal());
        view.getMetrics().add(support.metric("命中項目", page.getTotal(), "個", "default"));
        view.getMetrics().add(support.metric("進行中", inProgress, "個", "processing"));
        view.getMetrics().add(support.metric("逾期", overdue, "個", overdue > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("風險", risk, "個", risk > 0 ? "warning" : "default"));
        view.getColumns().add(support.column("projectNo", "項目編號", "text", 150));
        view.getColumns().add(support.column("name", "項目名稱", "text", 180));
        view.getColumns().add(support.column("pm", "項目經理", "text", 100));
        view.getColumns().add(support.column("productOwner", "產品負責人", "text", 110));
        view.getColumns().add(support.column("planEnd", "計劃結束", "date", 110));
        view.getColumns().add(support.column("delivery", "交付進度", "text", 120));
        view.getColumns().add(support.column("requirements", "需求數", "number", 80));
        AgentView.Column statusCol = support.column("status", "狀態", "tag", 100);
        statusCol.setToneMap(Map.of(
                "籌備中", "default", "進行中", "processing", "部分交付", "warning",
                "全部交付", "success", "已關閉", "default"));
        view.getColumns().add(statusCol);
        view.getColumns().add(support.column("marks", "標記", "text", 110));
        view.setRows(rows);
        view.getNotes().add(support.note("info", "口徑：" + hint));
        if (page.getTotal() > items.size()) {
            view.getNotes().add(support.note("warning",
                    "共 " + page.getTotal() + " 個項目，已列出前 " + items.size() + " 個；可縮小關鍵字或狀態範圍。"));
        }
        view.setLink(support.link("查看項目總覽", "/rdm-project"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("total", page.getTotal());
        content.put("returned", records.size());
        content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
        content.put("records", records);
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }

    private String lookupError(String error, String hint, List<Map<String, Object>> candidates) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", error);
        m.put("hint", hint);
        if (candidates != null && !candidates.isEmpty()) m.put("candidates", candidates);
        return support.json(m);
    }
}

package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.RdmProject;
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
import java.util.Set;

/** 需求多维查询：回答“有哪些需求 / 某状态 / 某项目 / 某迭代 / 某人的需求 / 逾期阻塞”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmQueryRequirementsTool implements AgentTool {

    private static final Set<String> PRE_ADMISSION_STAGES = Set.of(
            "draft", "approval_pending", "approval_rejected");
    private static final Set<String> PRE_ADMISSION_STATUS = Set.of(
            RdmConstants.STATUS_DRAFT, RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_INTAKE_REJECTED);

    private static final Map<String, String> STATUS_TONE = Map.ofEntries(
            Map.entry("草稿", "default"),
            Map.entry("待審批", "warning"),
            Map.entry("審批駁回", "error"),
            Map.entry("需求池·待分配", "warning"),
            Map.entry("已分配·待受理", "processing"),
            Map.entry("評估中", "processing"),
            Map.entry("已駁回", "error"),
            Map.entry("掛起暫緩", "warning"),
            Map.entry("已受理·待排期", "processing"),
            Map.entry("PRD 產出中", "processing"),
            Map.entry("PRD 編寫中", "processing"),
            Map.entry("評審中", "processing"),
            Map.entry("評審通過", "success"),
            Map.entry("已排期", "processing"),
            Map.entry("UI設計中", "processing"),
            Map.entry("開發中", "processing"),
            Map.entry("聯調中", "processing"),
            Map.entry("測試中", "processing"),
            Map.entry("測試通過", "success"),
            Map.entry("待業務驗收", "warning"),
            Map.entry("驗收未通過", "error"),
            Map.entry("已上線", "success"),
            Map.entry("已確認交付", "success"),
            Map.entry("已歸檔", "default"));

    private final RdmToolSupport support;
    private final RdmRequirementService requirementService;

    @Override
    public String toolKey() {
        return "rdm_query_requirements";
    }

    @Override
    public String description() {
        return "查詢產研需求清單：可按關鍵字、階段（待審批/待分配/開發中/測試中/驗收中/已完成等）、項目、迭代、產品負責人、提出人、當前處理人、逾期、阻塞篩選";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("keyword", Map.of("type", "string", "description", "需求標題、編號或提出人關鍵字"));
        props.put("stage", Map.of("type", "string", "description", "語義階段桶",
                "enum", List.of("draft", "approval_pending", "approval_rejected", "unassigned", "assigned",
                        "evaluating", "prd", "review", "scheduled", "developing", "testing", "acceptance",
                        "done", "on_hold", "rejected")));
        props.put("status", Map.of("type", "string", "description", "精確狀態碼（可選，優先於 stage）"));
        props.put("project", Map.of("type", "string", "description", "項目編號或名稱"));
        props.put("iterationCode", Map.of("type", "string", "description", "迭代編碼"));
        props.put("pm", Map.of("type", "string", "description", "產品負責人姓名或工號"));
        props.put("submitter", Map.of("type", "string", "description", "提出人姓名或工號"));
        props.put("handler", Map.of("type", "string", "description", "當前處理人姓名或工號（未完成任務負責人）"));
        props.put("overdueOnly", Map.of("type", "boolean", "description", "只看逾期"));
        props.put("blockedOnly", Map.of("type", "boolean", "description", "只看阻塞"));
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
                "rdm-requirement:view", "rdm-intake:view", "rdm-workbench:view", "rdm-acceptance:view");
        if (denied != null) return RichOutput.of(denied);

        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setPage(1);
        query.setSize(support.limit(args, 10, 20));
        query.setKeyword(support.argStr(args, "keyword"));
        String status = support.argStr(args, "status");
        String stage = support.argStr(args, "stage");
        query.setStatus(status);
        query.setStatuses(support.statusesOfStage(stage));
        query.setIterationCode(support.argStr(args, "iterationCode"));
        query.setOverdueOnly(support.argBool(args, "overdueOnly") ? Boolean.TRUE : null);
        query.setBlockedOnly(support.argBool(args, "blockedOnly") ? Boolean.TRUE : null);
        // 准入前状态（草稿/待审批/审批驳回）不在 scope=all 的口径里；用 person 视角 + relatedOnly 兜底
        boolean preAdmission = (status != null && PRE_ADMISSION_STATUS.contains(status))
                || (stage != null && PRE_ADMISSION_STAGES.contains(stage));
        query.setScope(preAdmission ? RdmConstants.SCOPE_PERSON : RdmConstants.SCOPE_ALL);

        String projectRaw = support.argStr(args, "project");
        if (projectRaw != null) {
            RdmToolSupport.ProjectLookup lookup = support.resolveProject(projectRaw, user);
            if (!lookup.ok()) return RichOutput.of(lookupError(lookup.error(), lookup.hint(), lookup.candidates()));
            RdmProject project = lookup.project();
            query.setProjectId(project.getId());
        }
        String pm = support.argStr(args, "pm");
        if (pm != null) {
            RdmToolSupport.PersonLookup p = support.resolvePerson(pm, user);
            if (!p.ok()) return RichOutput.of(lookupError(p.error(), p.hint(), p.candidates()));
            query.setPmUserId(p.user().getId());
        }
        String submitter = support.argStr(args, "submitter");
        if (submitter != null) {
            RdmToolSupport.PersonLookup p = support.resolvePerson(submitter, user);
            if (!p.ok()) return RichOutput.of(lookupError(p.error(), p.hint(), p.candidates()));
            query.setSubmitterUserId(p.user().getId());
        }
        String handler = support.argStr(args, "handler");
        if (handler != null) {
            RdmToolSupport.PersonLookup p = support.resolvePerson(handler, user);
            if (!p.ok()) return RichOutput.of(lookupError(p.error(), p.hint(), p.candidates()));
            query.setHandlerUserId(p.user().getId());
        }

        PageResult<RdmRequirementVO> page;
        Map<String, Long> stats;
        try {
            page = requirementService.page(query);
            stats = requirementService.stats(query);
        } catch (Exception e) {
            log.warn("[RdmQueryRequirements] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢需求失敗", "請稍後再試或縮小查詢範圍"));
        }
        List<RdmRequirementVO> items = page.getRecords() == null ? List.of() : page.getRecords();
        String hint = support.scopeHint(user);

        if (items.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("ok", true);
            empty.put("total", page.getTotal());
            empty.put("returned", 0);
            empty.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
            empty.put("records", List.of());
            empty.put("message", "未找到符合條件的需求");
            AgentView view = support.view("rdm_query_requirements:empty", "需求查詢", hint);
            view.getMetrics().add(support.metric("命中需求", page.getTotal(), "個", "default"));
            view.getNotes().add(support.note("info", "未找到符合條件的需求，可嘗試放寬階段、項目或關鍵字。"));
            return new RichOutput(support.json(empty), view, null);
        }

        List<Map<String, Object>> records = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        int blocked = 0;
        for (RdmRequirementVO r : items) {
            String statusLabel = support.requirementStatusLabel(r.getStatus());
            boolean overdue = Boolean.TRUE.equals(r.getOverdueFlag());
            boolean isBlocked = Boolean.TRUE.equals(r.getBlockedFlag());
            if (isBlocked) blocked++;
            String marks = (overdue ? "⚠逾期 " : "") + (isBlocked ? "⛔阻塞" : "");
            marks = marks.trim();
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("需求編號", r.getReqNo());
            rec.put("標題", r.getTitle());
            rec.put("狀態", statusLabel);
            rec.put("優先級", r.getPriority());
            rec.put("項目", r.getProjectName());
            rec.put("迭代", r.getIterationCode());
            rec.put("產品負責人", r.getPmName());
            rec.put("當前處理人", r.getCurrentHandler());
            rec.put("計劃上線", r.getPlanReleaseDate());
            rec.put("標記", marks);
            rec.put("更新時間", r.getUpdatedAt());
            records.add(rec);
            rows.add(support.row(
                    "reqNo", r.getReqNo(),
                    "title", support.truncate(r.getTitle(), 60),
                    "status", statusLabel,
                    "priority", r.getPriority(),
                    "project", r.getProjectName(),
                    "iteration", r.getIterationCode(),
                    "pm", r.getPmName(),
                    "handler", r.getCurrentHandler(),
                    "planRelease", r.getPlanReleaseDate(),
                    "marks", marks,
                    "updatedAt", r.getUpdatedAt()));
        }

        AgentView view = support.view("rdm_query_requirements", "需求查詢", hint);
        view.setTotal(page.getTotal() == null ? records.size() : page.getTotal().intValue());
        view.getMetrics().add(support.metric("命中需求", page.getTotal(), "個", "default"));
        view.getMetrics().add(support.metric("逾期", stats.getOrDefault("overdue", 0L), "個",
                stats.getOrDefault("overdue", 0L) > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("阻塞（當前頁）", blocked, "個", blocked > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("待驗收", stats.getOrDefault("toAccept", 0L), "個", "default"));
        view.getMetrics().add(support.metric("需求池", stats.getOrDefault("pool", 0L), "個", "default"));
        view.getColumns().add(support.column("reqNo", "需求編號", "text", 140));
        view.getColumns().add(support.column("title", "標題", "text", 220));
        AgentView.Column statusCol = support.column("status", "狀態", "tag", 110);
        statusCol.setToneMap(STATUS_TONE);
        view.getColumns().add(statusCol);
        view.getColumns().add(support.column("priority", "優先級", "text", 70));
        view.getColumns().add(support.column("project", "項目", "text", 150));
        view.getColumns().add(support.column("iteration", "迭代", "text", 110));
        view.getColumns().add(support.column("pm", "產品負責人", "text", 100));
        view.getColumns().add(support.column("handler", "當前處理人", "text", 100));
        view.getColumns().add(support.column("planRelease", "計劃上線", "date", 100));
        view.getColumns().add(support.column("marks", "標記", "text", 100));
        view.setRows(rows);
        view.getNotes().add(support.note("info", "口徑：" + hint));
        if (page.getTotal() != null && page.getTotal() > records.size()) {
            view.getNotes().add(support.note("warning",
                    "共 " + page.getTotal() + " 條，已列出前 " + records.size() + " 條；可縮小範圍或提高 limit。"));
        }
        view.setLink(support.link("查看需求跟進清單", "/rdm-requirement"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("total", page.getTotal());
        content.put("returned", records.size());
        content.put("stats", stats);
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

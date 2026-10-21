package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmProjectFactService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 单项目进度：回答“这个项目现在进度如何、卡在哪、有哪些风险”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmProjectProgressTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmProjectFactService factService;

    @Override
    public String toolKey() {
        return "rdm_project_progress";
    }

    @Override
    public String description() {
        return "查詢單個產研項目的進度：交付項完成情況、任務完成情況、需求數、阻塞/逾期/缺陷/待辦與計劃週期";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("project", Map.of("type", "string", "description", "項目編號或名稱（必填，支持模糊匹配）"));
        return Map.of("type", "object", "properties", props, "required", List.of("project"));
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

        String raw = support.argStr(args, "project");
        RdmToolSupport.ProjectLookup lookup = support.resolveProject(raw, user);
        if (!lookup.ok()) {
            return RichOutput.of(lookupError(lookup.error(), lookup.hint(), lookup.candidates()));
        }
        RdmProject project = lookup.project();
        RdmFactVO.ProjectFact fact;
        try {
            fact = factService.projectFact(project.getId(), user == null ? null : user.getId());
        } catch (Exception e) {
            log.warn("[RdmProjectProgress] 查询失败 projectId={}: {}", project.getId(), e.getMessage());
            return RichOutput.of(support.error("查詢項目進度失敗", "請稍後再試"));
        }
        if (fact == null) {
            return RichOutput.of(support.error("未取得該項目的進度數據", "請確認項目是否存在且有在途需求"));
        }

        String hint = support.scopeHint(user);
        String deliveryProgress = support.progressText(fact.getDeliveryItemCompleted(), fact.getDeliveryItemTotal());
        String taskProgress = support.progressText(fact.getTaskCompleted(), fact.getTaskTotal());

        List<Map<String, Object>> rows = new ArrayList<>();
        add(rows, "項目編號", fact.getProjectNo(), "");
        add(rows, "項目名稱", fact.getProjectName(), "");
        add(rows, "項目經理", fact.getPmUserName(), "");
        add(rows, "產品負責人", fact.getProductOwnerUserName(), "");
        add(rows, "計劃週期", nullToDash(fact.getPlanStartDate()) + " ~ " + nullToDash(fact.getPlanEndDate()), "");
        add(rows, "項目狀態", support.projectStatusLabel(fact.getStatus()), "");
        add(rows, "交付項", "共 " + fact.getDeliveryItemTotal() + " 個", "完成 " + fact.getDeliveryItemCompleted()
                + "；進行中 " + fact.getDeliveryItemInProgress()
                + "；測試中 " + fact.getDeliveryItemTesting()
                + "；待驗收 " + fact.getDeliveryItemPendingAcceptance()
                + "；阻塞 " + fact.getDeliveryItemBlocked()
                + "；逾期 " + fact.getDeliveryItemOverdue());
        add(rows, "任務", "共 " + fact.getTaskTotal() + " 個", "完成 " + fact.getTaskCompleted()
                + "；進行中 " + fact.getTaskInProgress()
                + "；阻塞 " + fact.getBlockedTaskCount());
        add(rows, "需求", "共 " + fact.getRequirementTotal() + " 個", "");
        add(rows, "缺陷", "開放 " + fact.getIssueOpen() + " 個", "嚴重 " + fact.getIssueCritical()
                + "；主要 " + fact.getIssueMajor());
        add(rows, "待決策", fact.getPendingDecisionCount() + " 個", "");
        add(rows, "待辦", fact.getTodoTotal() + " 個", "我的 " + fact.getTodoMineCount()
                + "；等待他人 " + fact.getTodoWaitingOthersCount());

        AgentView view = support.view("rdm_project_progress:" + project.getId(),
                "項目進度 · " + project.getName(), hint);
        view.getMetrics().add(support.metric("交付進度", deliveryProgress, null,
                fact.getDeliveryItemOverdue() > 0 ? "danger" : "success"));
        view.getMetrics().add(support.metric("任務完成", taskProgress, null, "default"));
        view.getMetrics().add(support.metric("需求數", fact.getRequirementTotal(), "個", "default"));
        view.getMetrics().add(support.metric("阻塞交付項", fact.getDeliveryItemBlocked(), "個",
                fact.getDeliveryItemBlocked() > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("逾期交付項", fact.getDeliveryItemOverdue(), "個",
                fact.getDeliveryItemOverdue() > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("待決策", fact.getPendingDecisionCount(), "個",
                fact.getPendingDecisionCount() > 0 ? "warning" : "default"));
        view.getColumns().add(support.column("metric", "指標", "text", 120));
        view.getColumns().add(support.column("value", "數值", "text", 140));
        view.getColumns().add(support.column("detail", "說明", "text", 300));
        view.setRows(rows);
        if (fact.getDeliveryItemOverdue() > 0 || fact.getDeliveryItemBlocked() > 0) {
            view.getNotes().add(support.note("danger", "存在逾期/阻塞交付項，建議先確認責任人與下一步時間。"));
        }
        view.getNotes().add(support.note("info", "口徑：" + hint + "；數據更新於 " + nullToDash(fact.getComputedAt())));
        view.setLink(support.link("查看項目詳情", "/rdm-project-detail?id=" + project.getId()));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("projectNo", fact.getProjectNo());
        content.put("projectName", fact.getProjectName());
        content.put("status", support.projectStatusLabel(fact.getStatus()));
        content.put("deliveryProgress", deliveryProgress);
        content.put("taskProgress", taskProgress);
        content.put("requirementTotal", fact.getRequirementTotal());
        content.put("deliveryItemBlocked", fact.getDeliveryItemBlocked());
        content.put("deliveryItemOverdue", fact.getDeliveryItemOverdue());
        content.put("blockedTaskCount", fact.getBlockedTaskCount());
        content.put("issueOpen", fact.getIssueOpen());
        content.put("pendingDecisionCount", fact.getPendingDecisionCount());
        content.put("todoTotal", fact.getTodoTotal());
        content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }

    private static void add(List<Map<String, Object>> rows, String metric, String value, String detail) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("metric", metric);
        r.put("value", value);
        if (detail != null && !detail.isBlank()) r.put("detail", detail);
        rows.add(r);
    }

    private static String nullToDash(String s) {
        return s == null || s.isBlank() ? "--" : s;
    }

    private String lookupError(String error, String hint, List<Map<String, Object>> candidates) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", error);
        m.put("hint", hint);
        if (candidates != null && !candidates.isEmpty()) m.put("candidates", candidates);
        return support.json(m);
    }
}

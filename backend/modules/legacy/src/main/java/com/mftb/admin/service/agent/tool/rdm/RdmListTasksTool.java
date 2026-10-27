package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 任务查询：回答“我的任务 / 某需求的任务清单”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmListTasksTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmDeliveryService deliveryService;
    private final RdmRequirementService requirementService;

    @Override
    public String toolKey() {
        return "rdm_list_tasks";
    }

    @Override
    public String description() {
        return "查詢研發任務：我的任務（可按狀態）或某個需求下的任務清單（負責人、狀態、計劃完成、工時、阻塞原因）";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("reqNo", Map.of("type", "string", "description", "需求編號（提供時查該需求的任務）"));
        props.put("mine", Map.of("type", "boolean", "description", "為 true 時查我的任務"));
        props.put("status", Map.of("type", "string", "description", "任務狀態",
                "enum", List.of("todo", "doing", "blocked", "done", "all")));
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
        String denied = support.requireAny(user, "rdm-workbench:view", "rdm-requirement:view");
        if (denied != null) return RichOutput.of(denied);

        String reqNo = support.argStr(args, "reqNo");
        String status = support.argStr(args, "status");
        if ("all".equals(status)) status = null;
        final String filterStatus = status;
        int limit = support.limit(args, 10, 20);
        List<RdmDeliveryVO.Task> list;
        String title;
        try {
            if (reqNo != null) {
                RdmRequirementQuery q = new RdmRequirementQuery();
                q.setPage(1);
                q.setSize(5);
                q.setKeyword(reqNo);
                q.setScope(RdmConstants.SCOPE_PERSON);
                PageResult<RdmRequirementVO> page = requirementService.page(q);
                List<RdmRequirementVO> candidates = page.getRecords() == null ? List.of() : page.getRecords();
                RdmRequirementVO target = candidates.stream()
                        .filter(r -> reqNo.equalsIgnoreCase(r.getReqNo())).findFirst().orElse(null);
                if (target == null) {
                    return RichOutput.of(support.error("未找到需求「" + reqNo + "」", "請確認需求編號是否正確"));
                }
                list = deliveryService.listTasks(target.getId());
                title = "任務清單 · " + target.getReqNo();
            } else {
                list = deliveryService.myTasks(status);
                title = "我的任務";
            }
        } catch (Exception e) {
            log.warn("[RdmListTasks] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢任務失敗", "請稍後再試或縮小範圍"));
        }
        if (list == null) list = List.of();
        if (status != null && reqNo != null) {
            list = list.stream().filter(t -> filterStatus.equals(t.getStatus())).toList();
        }
        if (list.size() > limit) list = list.subList(0, limit);

        String hint = support.scopeHint(user);
        AgentView view = support.view("rdm_list_tasks:" + (reqNo == null ? "mine" : reqNo) + ":" + status,
                title, hint);
        int doing = 0, blocked = 0, done = 0;
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Map<String, Object>> records = new ArrayList<>();
        for (RdmDeliveryVO.Task t : list) {
            if ("doing".equals(t.getStatus())) doing++;
            if ("blocked".equals(t.getStatus())) blocked++;
            if ("done".equals(t.getStatus())) done++;
            rows.add(support.row(
                    "taskNo", t.getTaskNo(),
                    "title", support.truncate(t.getTitle(), 60),
                    "reqNo", t.getReqNo(),
                    "owner", t.getOwnerName(),
                    "status", taskStatusLabel(t.getStatus()),
                    "planFinish", t.getPlanFinishDate(),
                    "hours", hours(t),
                    "blockedReason", support.truncate(t.getBlockedReason(), 60)));
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("任務編號", t.getTaskNo());
            rec.put("任務", t.getTitle());
            rec.put("需求編號", t.getReqNo());
            rec.put("負責人", t.getOwnerName());
            rec.put("狀態", taskStatusLabel(t.getStatus()));
            rec.put("計劃完成", t.getPlanFinishDate());
            rec.put("工時", hours(t));
            rec.put("阻塞原因", t.getBlockedReason());
            records.add(rec);
        }
        view.getMetrics().add(support.metric("任務總數", list.size(), "個", "default"));
        view.getMetrics().add(support.metric("進行中", doing, "個", "processing"));
        view.getMetrics().add(support.metric("阻塞", blocked, "個", blocked > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("已完成", done, "個", "success"));
        view.getColumns().add(support.column("taskNo", "任務編號", "text", 130));
        view.getColumns().add(support.column("title", "任務", "text", 220));
        view.getColumns().add(support.column("reqNo", "需求編號", "text", 140));
        view.getColumns().add(support.column("owner", "負責人", "text", 100));
        AgentView.Column statusCol = support.column("status", "狀態", "tag", 90);
        statusCol.setToneMap(Map.of("待辦", "default", "進行中", "processing", "阻塞", "error", "已完成", "success"));
        view.getColumns().add(statusCol);
        view.getColumns().add(support.column("planFinish", "計劃完成", "date", 100));
        view.getColumns().add(support.column("hours", "工時", "text", 90));
        view.getColumns().add(support.column("blockedReason", "阻塞原因", "text", 160));
        view.setRows(rows);
        view.getNotes().add(support.note("info", "口徑：" + hint));
        view.setLink(support.link("進入個人工作台", "/rdm-workbench"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("total", records.size());
        content.put("records", records);
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }

    private static String taskStatusLabel(String s) {
        if (s == null) return null;
        return switch (s) {
            case "todo" -> "待辦";
            case "doing" -> "進行中";
            case "blocked" -> "阻塞";
            case "done" -> "已完成";
            default -> s;
        };
    }

    private static String hours(RdmDeliveryVO.Task t) {
        if (t.getPlanHours() == null && t.getActualHours() == null) return null;
        return (t.getActualHours() == null ? "--" : t.getActualHours().stripTrailingZeros().toPlainString())
                + " / " + (t.getPlanHours() == null ? "--" : t.getPlanHours().stripTrailingZeros().toPlainString());
    }
}

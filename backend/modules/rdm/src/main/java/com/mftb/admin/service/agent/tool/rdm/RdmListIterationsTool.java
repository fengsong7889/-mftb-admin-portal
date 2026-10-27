package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** 迭代列表：回答“有哪些迭代 / 某项目有哪些迭代 / 进行中的迭代”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmListIterationsTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmDeliveryService deliveryService;

    @Override
    public String toolKey() {
        return "rdm_list_iterations";
    }

    @Override
    public String description() {
        return "查詢產研迭代清單：可按項目、關鍵字、狀態（規劃中/進行中/已關閉）、類型（常規/版本/緊急修復）篩選，並返回需求數與任務數";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("project", Map.of("type", "string", "description", "項目編號或名稱（可選，模糊匹配）"));
        props.put("keyword", Map.of("type", "string", "description", "迭代編碼或名稱關鍵字"));
        props.put("status", Map.of("type", "string", "description", "迭代狀態",
                "enum", List.of("planning", "active", "closed")));
        props.put("type", Map.of("type", "string", "description", "迭代類型",
                "enum", List.of("sprint", "version", "hotfix")));
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
                "rdm-delivery-iteration:view", "rdm-dashboard-project:view");
        if (denied != null) return RichOutput.of(denied);

        Long projectId = null;
        String projectRaw = support.argStr(args, "project");
        if (projectRaw != null) {
            RdmToolSupport.ProjectLookup lookup = support.resolveProject(projectRaw, user);
            if (!lookup.ok()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("error", lookup.error());
                m.put("hint", lookup.hint());
                if (!lookup.candidates().isEmpty()) m.put("candidates", lookup.candidates());
                return RichOutput.of(support.json(m));
            }
            RdmProject project = lookup.project();
            projectId = project.getId();
        }
        String status = support.argStr(args, "status");
        String type = support.argStr(args, "type");
        int limit = support.limit(args, 10, 20);

        List<RdmDeliveryVO.Iteration> list;
        try {
            list = deliveryService.listIterations(support.argStr(args, "keyword"), projectId,
                    Math.min(200, Math.max(limit * 5, 50)));
        } catch (Exception e) {
            log.warn("[RdmListIterations] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢迭代失敗", "請稍後再試或縮小查詢範圍"));
        }
        // listIterations 本身不按用户数据范围收口：这里按可见项目过滤，无项目迭代仅负责人/全量可见
        RdmFactVO.Scope scope = support.scope(user);
        if (!scope.isCanSeeAll()) {
            List<Long> visible = scope.getProjectIds() == null ? List.of() : scope.getProjectIds();
            Long uid = user == null ? null : user.getId();
            list = list.stream().filter(it -> it.getProjectId() != null
                    ? visible.contains(it.getProjectId())
                    : Objects.equals(it.getOwnerUserId(), uid)).toList();
        }
        if (status != null) {
            list = list.stream().filter(it -> status.equals(it.getStatus())).toList();
        }
        if (type != null) {
            list = list.stream().filter(it -> type.equals(it.getIterationType())).toList();
        }
        if (list.size() > limit) list = list.subList(0, limit);

        String hint = support.scopeHint(user);
        if (list.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("ok", true);
            empty.put("total", 0);
            empty.put("returned", 0);
            empty.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
            empty.put("records", List.of());
            empty.put("message", "未找到符合條件的迭代");
            AgentView view = support.view("rdm_list_iterations:empty", "迭代查詢", hint);
            view.getNotes().add(support.note("info", "未找到符合條件的迭代，可嘗試放寬項目或狀態。"));
            return new RichOutput(support.json(empty), view, null);
        }

        List<Map<String, Object>> records = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        int active = 0;
        int reqTotal = 0;
        int taskTotal = 0;
        for (RdmDeliveryVO.Iteration it : list) {
            String statusLabel = support.iterationStatusLabel(it.getStatus());
            if ("進行中".equals(statusLabel)) active++;
            int req = it.getReqCount() == null ? 0 : it.getReqCount();
            int task = it.getTaskCount() == null ? 0 : it.getTaskCount();
            reqTotal += req;
            taskTotal += task;
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("迭代編碼", it.getCode());
            rec.put("迭代名稱", it.getName());
            rec.put("所屬項目", it.getProjectName());
            rec.put("類型", support.iterationTypeLabel(it.getIterationType()));
            rec.put("起止", it.getStartDate() + " ~ " + it.getEndDate());
            rec.put("負責人", it.getOwnerName());
            rec.put("需求數", req);
            rec.put("任務數", task);
            rec.put("狀態", statusLabel);
            records.add(rec);
            rows.add(support.row(
                    "code", it.getCode(),
                    "name", it.getName(),
                    "project", it.getProjectName(),
                    "type", support.iterationTypeLabel(it.getIterationType()),
                    "start", it.getStartDate(),
                    "end", it.getEndDate(),
                    "owner", it.getOwnerName(),
                    "reqCount", req,
                    "taskCount", task,
                    "status", statusLabel));
        }

        AgentView view = support.view("rdm_list_iterations", "迭代查詢", hint);
        view.setTotal(list.size());
        view.getMetrics().add(support.metric("命中迭代", list.size(), "個", "default"));
        view.getMetrics().add(support.metric("進行中", active, "個", "processing"));
        view.getMetrics().add(support.metric("需求總數", reqTotal, "個", "default"));
        view.getMetrics().add(support.metric("任務總數", taskTotal, "個", "default"));
        view.getColumns().add(support.column("code", "迭代編碼", "text", 120));
        view.getColumns().add(support.column("name", "迭代名稱", "text", 180));
        view.getColumns().add(support.column("project", "所屬項目", "text", 160));
        view.getColumns().add(support.column("type", "類型", "tag", 100));
        view.getColumns().add(support.column("start", "開始", "date", 100));
        view.getColumns().add(support.column("end", "結束", "date", 100));
        view.getColumns().add(support.column("owner", "負責人", "text", 100));
        view.getColumns().add(support.column("reqCount", "需求數", "number", 80));
        view.getColumns().add(support.column("taskCount", "任務數", "number", 80));
        AgentView.Column statusCol = support.column("status", "狀態", "tag", 90);
        statusCol.setToneMap(Map.of("規劃中", "default", "進行中", "processing", "已關閉", "success"));
        view.getColumns().add(statusCol);
        view.setRows(rows);
        view.getNotes().add(support.note("info", "口徑：" + hint));
        view.setLink(support.link("查看迭代排期", "/rdm-iteration"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("total", records.size());
        content.put("returned", records.size());
        content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
        content.put("records", records);
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }
}

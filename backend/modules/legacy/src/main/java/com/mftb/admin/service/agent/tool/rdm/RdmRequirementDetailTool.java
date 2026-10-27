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

/** 需求详情：回答“某需求现在卡在谁、流转到哪、计划/实际时间、验收结论”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmRequirementDetailTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmRequirementService requirementService;

    @Override
    public String toolKey() {
        return "rdm_requirement_detail";
    }

    @Override
    public String description() {
        return "查詢單個產研需求的詳情：狀態、人員、項目/迭代、計劃與實際時間、當前處理人、停留時長、阻塞/駁回原因、最近流轉與驗收結論";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("reqNo", Map.of("type", "string", "description", "需求編號（精確匹配，優先使用）"));
        props.put("keyword", Map.of("type", "string", "description", "需求標題關鍵字（未提供 reqNo 時使用）"));
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

        String reqNo = support.argStr(args, "reqNo");
        String keyword = support.argStr(args, "keyword");
        if (reqNo == null && keyword == null) {
            return RichOutput.of(support.error("請提供需求編號或標題關鍵字", "例如：REQ2026090101 或 會員登入"));
        }
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setPage(1);
        query.setSize(5);
        query.setKeyword(reqNo != null ? reqNo : keyword);
        // 详情查询可能命中准入前状态；person 视角不设状态地板，仍由 relatedOnly 收敛
        query.setScope(RdmConstants.SCOPE_PERSON);
        PageResult<RdmRequirementVO> page;
        try {
            page = requirementService.page(query);
        } catch (Exception e) {
            log.warn("[RdmRequirementDetail] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢需求失敗", "請稍後再試"));
        }
        List<RdmRequirementVO> candidates = page.getRecords() == null ? List.of() : page.getRecords();
        RdmRequirementVO target = null;
        if (reqNo != null) {
            target = candidates.stream().filter(r -> reqNo.equalsIgnoreCase(r.getReqNo())).findFirst().orElse(null);
        }
        if (target == null && candidates.size() == 1) {
            target = candidates.get(0);
        }
        if (target == null) {
            if (candidates.isEmpty()) {
                return RichOutput.of(support.error("未找到需求「" + (reqNo != null ? reqNo : keyword) + "」",
                        "請確認需求編號或標題是否正確"));
            }
            List<Map<String, Object>> list = candidates.stream().map(r -> {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("需求編號", r.getReqNo());
                c.put("標題", r.getTitle());
                c.put("狀態", support.requirementStatusLabel(r.getStatus()));
                c.put("提出人", r.getSubmitterName());
                return c;
            }).toList();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("error", "找到多條匹配的需求，請確認是哪一條");
            m.put("hint", "請用需求編號精確查詢");
            m.put("candidates", list);
            return RichOutput.of(support.json(m));
        }

        RdmRequirementVO d;
        try {
            d = requirementService.detail(target.getId());
        } catch (Exception e) {
            log.warn("[RdmRequirementDetail] 详情失败 reqId={}: {}", target.getId(), e.getMessage());
            return RichOutput.of(support.error("無法查看該需求詳情", "請確認您是否有權查看該需求"));
        }
        String hint = support.scopeHint(user);
        String statusLabel = support.requirementStatusLabel(d.getStatus());

        List<Map<String, Object>> rows = new ArrayList<>();
        add(rows, "需求編號", d.getReqNo());
        add(rows, "標題", d.getTitle());
        add(rows, "狀態", statusLabel);
        add(rows, "優先級", d.getPriority());
        add(rows, "需求類型", d.getReqType());
        add(rows, "項目", d.getProjectName());
        add(rows, "迭代", d.getIterationCode());
        add(rows, "提出人", join(d.getSubmitterName(), d.getSubmitDeptName()));
        add(rows, "產品負責人", d.getPmName());
        add(rows, "研發負責人", d.getDevOwnerName());
        add(rows, "驗收人", d.getAcceptorName());
        add(rows, "提交時間", d.getSubmitTime());
        add(rows, "受理時間", d.getAcceptTime());
        add(rows, "計劃開發", d.getPlanDevDate());
        add(rows, "計劃上線", d.getPlanReleaseDate());
        add(rows, "實際上線", d.getActualReleaseDate());
        add(rows, "版本", d.getVersionNo());
        add(rows, "當前處理人", d.getCurrentHandler());
        add(rows, "進度", d.getProgress() == null ? null : d.getProgress() + "%");
        add(rows, "當前停留", d.getStayHours() == null ? null : d.getStayHours() + " 小時");
        add(rows, "逾期", Boolean.TRUE.equals(d.getOverdueFlag()) ? "是" : "否");
        if (Boolean.TRUE.equals(d.getBlockedFlag())) add(rows, "阻塞原因", d.getBlockedReason());
        if (d.getRejectReason() != null) add(rows, "駁回原因", d.getRejectReason());
        add(rows, "駁回/返工/變更", nullToDash(d.getRejectCount()) + " / "
                + nullToDash(d.getReworkCount()) + " / " + nullToDash(d.getChangeCount()));
        if (d.getAcceptanceResult() != null) {
            add(rows, "驗收結論", d.getAcceptanceResult()
                    + (d.getAcceptanceScore() == null ? "" : "（" + d.getAcceptanceScore() + " 分）"));
        }
        rows.removeIf(r -> r.get("value") == null || String.valueOf(r.get("value")).isBlank());

        AgentView view = support.view("rdm_requirement_detail:" + d.getId(),
                "需求詳情 · " + d.getReqNo(), hint);
        view.getMetrics().add(support.metric("進度", d.getProgress() == null ? 0 : d.getProgress(), "%", "default"));
        view.getMetrics().add(support.metric("當前停留", d.getStayHours() == null ? 0 : d.getStayHours(), "小時",
                d.getStayHours() != null && d.getStayHours() > 168 ? "danger" : "default"));
        view.getMetrics().add(support.metric("駁回次數", nvl(d.getRejectCount()), "次", "default"));
        view.getMetrics().add(support.metric("返工次數", nvl(d.getReworkCount()), "次", "default"));
        view.getColumns().add(support.column("field", "字段", "text", 130));
        view.getColumns().add(support.column("value", "值", "text", 320));
        view.setRows(rows);
        if (Boolean.TRUE.equals(d.getBlockedFlag()) && d.getBlockedReason() != null) {
            view.getNotes().add(support.note("danger", "阻塞原因：" + d.getBlockedReason()));
        }
        if (d.getRejectReason() != null) {
            view.getNotes().add(support.note("warning", "最近駁回原因：" + d.getRejectReason()));
        }
        view.getNotes().add(support.note("info", "口徑：" + hint));

        // 最近 5 条流转（detail 返回的 timeline 已按最新在前）
        if (d.getTimeline() != null && !d.getTimeline().isEmpty()) {
            AgentView timeline = support.view("rdm_requirement_detail:timeline:" + d.getId(),
                    "最近流轉", "按時間倒序，最多 5 條");
            timeline.getColumns().add(support.column("time", "時間", "text", 150));
            timeline.getColumns().add(support.column("status", "狀態", "tag", 110));
            timeline.getColumns().add(support.column("operator", "操作人", "text", 100));
            timeline.getColumns().add(support.column("remark", "備註", "text", 220));
            List<Map<String, Object>> tRows = new ArrayList<>();
            for (RdmRequirementVO.TimelineNode n : d.getTimeline().stream().limit(5).toList()) {
                tRows.add(support.row(
                        "time", n.getTime(),
                        "status", n.getStatusLabel() == null ? support.requirementStatusLabel(n.getStatus()) : n.getStatusLabel(),
                        "operator", n.getOperatorName(),
                        "remark", support.truncate(n.getRemark(), 80)));
            }
            timeline.setRows(tRows);
            // 视图上限 3 个：详情 + 流转 + 空位；这里直接返回两个
            Map<String, Object> content = new LinkedHashMap<>();
            content.put("ok", true);
            content.put("reqNo", d.getReqNo());
            content.put("title", d.getTitle());
            content.put("status", statusLabel);
            content.put("priority", d.getPriority());
            content.put("project", d.getProjectName());
            content.put("iteration", d.getIterationCode());
            content.put("pm", d.getPmName());
            content.put("devOwner", d.getDevOwnerName());
            content.put("currentHandler", d.getCurrentHandler());
            content.put("progress", d.getProgress());
            content.put("stayHours", d.getStayHours());
            content.put("overdue", Boolean.TRUE.equals(d.getOverdueFlag()));
            content.put("blocked", Boolean.TRUE.equals(d.getBlockedFlag()));
            content.put("blockedReason", d.getBlockedReason());
            content.put("timeline", tRows);
            content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
            content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
            view.setLink(support.link("查看需求詳情", RdmConstants.ROUTE_REQUIREMENT_DETAIL + "?id=" + d.getId()));
            return new RichOutput(support.json(content), view, null);
        }

        view.setLink(support.link("查看需求詳情", RdmConstants.ROUTE_REQUIREMENT_DETAIL + "?id=" + d.getId()));
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("reqNo", d.getReqNo());
        content.put("title", d.getTitle());
        content.put("status", statusLabel);
        content.put("project", d.getProjectName());
        content.put("iteration", d.getIterationCode());
        content.put("currentHandler", d.getCurrentHandler());
        content.put("progress", d.getProgress());
        content.put("blocked", Boolean.TRUE.equals(d.getBlockedFlag()));
        content.put("blockedReason", d.getBlockedReason());
        content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }

    private static void add(List<Map<String, Object>> rows, String field, Object value) {
        if (value == null) return;
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("field", field);
        r.put("value", value);
        rows.add(r);
    }

    private static String join(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return a + "（" + b + "）";
    }

    private static String nullToDash(Object v) {
        return v == null ? "--" : String.valueOf(v);
    }

    private static int nvl(Integer v) {
        return v == null ? 0 : v;
    }
}

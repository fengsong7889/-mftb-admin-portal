package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.dto.RdmDashboardVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAnalyticsService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 交付统计：回答“本月提交/交付多少、部门与 PM 排名、阶段负载、趋势”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmStatsOverviewTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmAnalyticsService analyticsService;

    @Override
    public String toolKey() {
        return "rdm_stats_overview";
    }

    @Override
    public String description() {
        return "查詢產研交付全局統計：需求總量、本月提交/交付、逾期/阻塞/待分配、部門排名、產品經理排名、階段負載";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("period", Map.of("type", "string", "description", "統計週期",
                "enum", List.of("week", "month", "quarter", "year")));
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
                "rdm-dashboard-board:view", "rdm-workbench:view", "rdm-requirement:view",
                "rdm-intake:view", "rdm-acceptance:view", "rdm-dashboard-risk:view",
                "rdm-efficiency-output:view", "rdm-requirement:view_all");
        if (denied != null) return RichOutput.of(denied);

        String period = support.argStr(args, "period");
        if (period == null) period = "month";
        RdmDashboardVO data;
        try {
            data = analyticsService.overview(period);
        } catch (Exception e) {
            log.warn("[RdmStatsOverview] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢交付統計失敗", "請稍後再試"));
        }
        if (data == null || data.getOverview() == null) {
            return RichOutput.of(support.error("未取得統計數據", "請稍後再試"));
        }
        RdmDashboardVO.Overview o = data.getOverview();
        String hint = "全局口徑，週期=" + periodLabel(period);

        AgentView view = support.view("rdm_stats_overview:" + period, "交付統計 · " + periodLabel(period), hint);
        view.getMetrics().add(support.metric("需求總量", o.getReqTotal(), "個", "default"));
        view.getMetrics().add(support.metric("本月提交", o.getSubmittedThisMonth(), "個", "processing"));
        view.getMetrics().add(support.metric("本月交付", o.getDeliveredThisMonth(), "個", "success"));
        view.getMetrics().add(support.metric("逾期存量", o.getOverdueTotal(), "個",
                o.getOverdueTotal() != null && o.getOverdueTotal() > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("阻塞", o.getBlockedTotal(), "個",
                o.getBlockedTotal() != null && o.getBlockedTotal() > 0 ? "warning" : "default"));
        view.getMetrics().add(support.metric("待分配", o.getUnassignedTotal(), "個", "default"));

        view.getColumns().add(support.column("dept", "部門", "text", 160));
        view.getColumns().add(support.column("submitted", "提交", "number", 80));
        view.getColumns().add(support.column("delivered", "交付", "number", 80));
        view.getColumns().add(support.column("onTime", "按時率", "text", 90));
        view.getColumns().add(support.column("avgDays", "平均天數", "text", 100));
        List<Map<String, Object>> deptRows = new ArrayList<>();
        if (data.getDeptRank() != null) {
            for (RdmDashboardVO.DeptRank d : data.getDeptRank().stream().limit(5).toList()) {
                deptRows.add(support.row(
                        "dept", d.getDeptName(),
                        "submitted", d.getSubmitted(),
                        "delivered", d.getDelivered(),
                        "onTime", percent(d.getOnTimeRate()),
                        "avgDays", number(d.getAvgDays())));
            }
        }
        view.setRows(deptRows);

        AgentView pmView = support.view("rdm_stats_overview:pm:" + period, "產品經理排名（前 5）", hint);
        pmView.getColumns().add(support.column("pm", "產品經理", "text", 120));
        pmView.getColumns().add(support.column("active", "在途", "number", 80));
        pmView.getColumns().add(support.column("delivered", "交付", "number", 80));
        pmView.getColumns().add(support.column("overdue", "逾期", "number", 80));
        pmView.getColumns().add(support.column("avgDays", "平均天數", "text", 100));
        List<Map<String, Object>> pmRows = new ArrayList<>();
        if (data.getPmRank() != null) {
            for (RdmDashboardVO.PmRank p : data.getPmRank().stream().limit(5).toList()) {
                pmRows.add(support.row(
                        "pm", p.getPmName(),
                        "active", p.getActive(),
                        "delivered", p.getDelivered(),
                        "overdue", p.getOverdue(),
                        "avgDays", number(p.getAvgDays())));
            }
        }
        pmView.setRows(pmRows);

        AgentView boardView = support.view("rdm_stats_overview:board:" + period, "階段負載", "交付流水線各階段數量與逾期");
        boardView.getColumns().add(support.column("stage", "階段", "text", 180));
        boardView.getColumns().add(support.column("count", "數量", "number", 80));
        boardView.getColumns().add(support.column("overdue", "逾期", "number", 80));
        List<Map<String, Object>> boardRows = new ArrayList<>();
        if (data.getBoard() != null && data.getBoard().getColumns() != null) {
            for (RdmDashboardVO.BoardColumn c : data.getBoard().getColumns()) {
                boardRows.add(support.row("stage", c.getTitle(), "count", c.getCount(), "overdue", c.getOverdue()));
            }
        }
        boardView.setRows(boardRows);

        view.getNotes().add(support.note("info", "口徑：全局統計，按所選週期計算；部門/PM 排名取前 5。"));
        if (o.getOnTimeRate() != null) {
            view.getNotes().add(support.note("info", "按時上線率：" + percent(o.getOnTimeRate())
                    + "；平均交付週期：" + number(o.getAvgDeliveryDays()) + " 天。"));
        }
        view.setLink(support.link("查看交付看板", "/rdm-dashboard-board"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("period", period);
        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("reqTotal", o.getReqTotal());
        overview.put("submittedThisMonth", o.getSubmittedThisMonth());
        overview.put("deliveredThisMonth", o.getDeliveredThisMonth());
        overview.put("overdueTotal", o.getOverdueTotal());
        overview.put("blockedTotal", o.getBlockedTotal());
        overview.put("unassignedTotal", o.getUnassignedTotal());
        overview.put("onTimeRate", o.getOnTimeRate());
        overview.put("avgDeliveryDays", o.getAvgDeliveryDays());
        content.put("overview", overview);
        content.put("deptRank", deptRows);
        content.put("pmRank", pmRows);
        content.put("board", boardRows);
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }

    private static String periodLabel(String p) {
        return switch (p) {
            case "week" -> "近 7 天";
            case "quarter" -> "近 90 天";
            case "year" -> "近 365 天";
            default -> "近 30 天";
        };
    }

    private static String percent(Double v) {
        return v == null ? "--" : Math.round(v * 100) + "%";
    }

    private static String number(Double v) {
        return v == null ? "--" : String.valueOf(Math.round(v * 10) / 10.0);
    }
}

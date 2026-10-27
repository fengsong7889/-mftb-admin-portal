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

/** 风险清单：逾期 / 阻塞 / 停滞 / 无主 / 审批卡住。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmRisksTool implements AgentTool {

    private static final Map<String, String> RISK_LABEL = Map.of(
            "BLOCKED", "阻塞",
            "UNASSIGNED", "無主（待分配）",
            "INTAKE_STUCK", "審批停滯",
            "OVERDUE", "逾期",
            "STAGNANT", "長期無進展");

    private static final Map<String, String> RISK_TONE = Map.of(
            "阻塞", "error",
            "無主（待分配）", "warning",
            "審批停滯", "warning",
            "逾期", "error",
            "長期無進展", "warning");

    private final RdmToolSupport support;
    private final RdmAnalyticsService analyticsService;

    @Override
    public String toolKey() {
        return "rdm_risks";
    }

    @Override
    public String description() {
        return "查詢產研交付風險清單：阻塞、逾期、長期無進展、無主（待分配）、審批停滯的需求，可按風險類型和停留天數篩選";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("riskType", Map.of("type", "string", "description", "風險類型",
                "enum", List.of("blocked", "unassigned", "intake_stuck", "overdue", "stagnant", "all")));
        props.put("minStayDays", Map.of("type", "integer", "description", "只看當前狀態停留 ≥ N 天的風險；0=全部"));
        props.put("limit", Map.of("type", "integer", "description", "返回行數，默認 15，最多 30"));
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
                "rdm-dashboard-risk:view", "rdm-dashboard-board:view", "rdm-dashboard-quality:view",
                "rdm-requirement:view_all");
        if (denied != null) return RichOutput.of(denied);

        int limit = support.limit(args, 15, 30);
        Integer minStay = support.argInt(args, "minStayDays");
        int stay = minStay == null || minStay < 0 ? 0 : minStay;
        String type = support.argStr(args, "riskType");
        List<RdmDashboardVO.Risk> list;
        try {
            list = analyticsService.riskList(limit, stay);
        } catch (Exception e) {
            log.warn("[RdmRisks] 查询失败 caller={}: {}", ctx.caller(), e.getMessage());
            return RichOutput.of(support.error("查詢風險清單失敗", "請稍後再試"));
        }
        if (list == null) list = List.of();
        if (type != null && !"all".equalsIgnoreCase(type)) {
            String code = type.trim().toUpperCase();
            list = list.stream().filter(r -> code.equalsIgnoreCase(r.getRiskType())).toList();
        }

        AgentView view = support.view("rdm_risks:" + (type == null ? "all" : type) + ":" + stay,
                "風險清單", "風險中心同口徑；停留天數按當前狀態計算");
        view.setTotal(list.size());
        int blocked = 0, overdue = 0, unassigned = 0, stuck = 0, stagnant = 0;
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Map<String, Object>> records = new ArrayList<>();
        for (RdmDashboardVO.Risk r : list) {
            String label = RISK_LABEL.getOrDefault(r.getRiskType() == null ? "" : r.getRiskType().toUpperCase(),
                    r.getRiskType());
            switch (r.getRiskType() == null ? "" : r.getRiskType().toUpperCase()) {
                case "BLOCKED" -> blocked++;
                case "OVERDUE" -> overdue++;
                case "UNASSIGNED" -> unassigned++;
                case "INTAKE_STUCK" -> stuck++;
                case "STAGNANT" -> stagnant++;
                default -> { }
            }
            rows.add(support.row(
                    "riskType", label,
                    "reqNo", r.getReqNo(),
                    "title", support.truncate(r.getTitle(), 60),
                    "status", support.requirementStatusLabel(r.getStatus()),
                    "submitter", r.getSubmitterName(),
                    "handler", r.getHandler(),
                    "days", r.getDays()));
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("風險類型", label);
            rec.put("需求編號", r.getReqNo());
            rec.put("標題", r.getTitle());
            rec.put("狀態", support.requirementStatusLabel(r.getStatus()));
            rec.put("提出人", r.getSubmitterName());
            rec.put("處理人", r.getHandler());
            rec.put("停留天數", r.getDays());
            records.add(rec);
        }
        view.getMetrics().add(support.metric("風險總數", list.size(), "條", "default"));
        view.getMetrics().add(support.metric("阻塞", blocked, "條", blocked > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("逾期", overdue, "條", overdue > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("無主", unassigned, "條", unassigned > 0 ? "warning" : "default"));
        view.getMetrics().add(support.metric("審批停滯", stuck, "條", stuck > 0 ? "warning" : "default"));
        view.getMetrics().add(support.metric("長期無進展", stagnant, "條", stagnant > 0 ? "warning" : "default"));
        view.getColumns().add(support.column("riskType", "風險類型", "tag", 120));
        view.getColumns().add(support.column("reqNo", "需求編號", "text", 140));
        view.getColumns().add(support.column("title", "標題", "text", 220));
        view.getColumns().add(support.column("status", "狀態", "tag", 110));
        view.getColumns().add(support.column("submitter", "提出人", "text", 100));
        view.getColumns().add(support.column("handler", "處理人", "text", 100));
        view.getColumns().add(support.column("days", "停留天數", "number", 90));
        view.setRows(rows);
        view.getNotes().add(support.note("info",
                "口徑：逾期/阻塞/無主/審批停滯/停留 ≥7 天無進展；與「風險中心」同源。"));
        if (stay > 0) {
            view.getNotes().add(support.note("info", "已按停留 ≥ " + stay + " 天篩選。"));
        }
        view.setLink(support.link("查看風險中心", "/rdm-risk"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("total", records.size());
        content.put("counts", Map.of(
                "blocked", blocked, "overdue", overdue, "unassigned", unassigned,
                "intakeStuck", stuck, "stagnant", stagnant));
        content.put("records", records);
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }
}

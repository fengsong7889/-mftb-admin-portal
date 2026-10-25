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

/** 人员工作量：回答“张三负责哪些需求 / 某人当前处理多少 / 某人提交了什么”。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmPersonWorkloadTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmRequirementService requirementService;

    @Override
    public String toolKey() {
        return "rdm_person_workload";
    }

    @Override
    public String description() {
        return "查詢某位員工在產研需求上的工作量：負責/提交/當前處理的需求清單與數量；查他人需全量查看權，查自己不受限";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("person", Map.of("type", "string", "description", "員工姓名或工號（必填）"));
        props.put("role", Map.of("type", "string", "description", "关系维度：any=全部相关，pm=產品負責人，submitter=提出人，handler=當前處理人",
                "enum", List.of("any", "pm", "submitter", "handler")));
        props.put("limit", Map.of("type", "integer", "description", "返回行數，默認 10，最多 20"));
        return Map.of("type", "object", "properties", props, "required", List.of("person"));
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
                "rdm-requirement:view", "rdm-workbench:view");
        if (denied != null) return RichOutput.of(denied);

        String personRaw = support.argStr(args, "person");
        if (personRaw == null) {
            return RichOutput.of(support.error("請提供員工姓名或工號", "例如：張三 或 MF00001"));
        }
        RdmToolSupport.PersonLookup lookup = support.resolvePerson(personRaw, user);
        if (!lookup.ok()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("error", lookup.error());
            m.put("hint", lookup.hint());
            if (!lookup.candidates().isEmpty()) m.put("candidates", lookup.candidates());
            return RichOutput.of(support.json(m));
        }
        SysUser target = lookup.user();
        boolean self = support.sameUser(user, target);
        if (!self && !support.canSeeAll(user)) {
            return RichOutput.of(support.error("您沒有查看他人需求的權限",
                    "只能查詢與自己相關的需求；如需查看全公司，請聯繫管理員開通「需求全量查看」權限"));
        }

        String role = support.argStr(args, "role");
        if (role == null) role = "any";
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setPage(1);
        query.setSize(support.limit(args, 10, 20));
        query.setScope(RdmConstants.SCOPE_PERSON);
        switch (role) {
            case "pm" -> query.setPmUserId(target.getId());
            case "submitter" -> query.setSubmitterUserId(target.getId());
            case "handler" -> query.setHandlerUserId(target.getId());
            default -> query.setRelatedUserId(target.getId());
        }

        PageResult<RdmRequirementVO> page;
        Map<String, Long> stats;
        try {
            page = requirementService.page(query);
            stats = requirementService.stats(query);
        } catch (Exception e) {
            log.warn("[RdmPersonWorkload] 查询失败 target={}: {}", target.getId(), e.getMessage());
            return RichOutput.of(support.error("查詢人員工作量失敗", "請稍後再試"));
        }
        List<RdmRequirementVO> items = page.getRecords() == null ? List.of() : page.getRecords();
        String hint = self ? "本人數據（不受全量權限限制）" : support.scopeHint(user);
        String personLabel = target.getName() + (target.getEmpId() == null ? "" : "（" + target.getEmpId() + "）");

        AgentView view = support.view("rdm_person_workload:" + target.getId() + ":" + role,
                "人員工作量 · " + personLabel, hint);
        view.setTotal(page.getTotal() == null ? 0 : page.getTotal().intValue());
        view.getMetrics().add(support.metric("相關需求", page.getTotal(), "個", "default"));
        view.getMetrics().add(support.metric("逾期", stats.getOrDefault("overdue", 0L), "個",
                stats.getOrDefault("overdue", 0L) > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("待驗收", stats.getOrDefault("toAccept", 0L), "個", "default"));
        view.getMetrics().add(support.metric("需求池", stats.getOrDefault("pool", 0L), "個", "default"));
        view.getColumns().add(support.column("reqNo", "需求編號", "text", 140));
        view.getColumns().add(support.column("title", "標題", "text", 220));
        view.getColumns().add(support.column("status", "狀態", "tag", 110));
        view.getColumns().add(support.column("project", "項目", "text", 140));
        view.getColumns().add(support.column("iteration", "迭代", "text", 110));
        view.getColumns().add(support.column("handler", "當前處理人", "text", 100));
        view.getColumns().add(support.column("planRelease", "計劃上線", "date", 100));
        view.getColumns().add(support.column("marks", "標記", "text", 100));

        List<Map<String, Object>> rows = new ArrayList<>();
        List<Map<String, Object>> records = new ArrayList<>();
        for (RdmRequirementVO r : items) {
            String marks = (Boolean.TRUE.equals(r.getOverdueFlag()) ? "⚠逾期 " : "")
                    + (Boolean.TRUE.equals(r.getBlockedFlag()) ? "⛔阻塞" : "");
            marks = marks.trim();
            rows.add(support.row(
                    "reqNo", r.getReqNo(),
                    "title", support.truncate(r.getTitle(), 60),
                    "status", support.requirementStatusLabel(r.getStatus()),
                    "project", r.getProjectName(),
                    "iteration", r.getIterationCode(),
                    "handler", r.getCurrentHandler(),
                    "planRelease", r.getPlanReleaseDate(),
                    "marks", marks));
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("需求編號", r.getReqNo());
            rec.put("標題", r.getTitle());
            rec.put("狀態", support.requirementStatusLabel(r.getStatus()));
            rec.put("項目", r.getProjectName());
            rec.put("迭代", r.getIterationCode());
            rec.put("當前處理人", r.getCurrentHandler());
            rec.put("計劃上線", r.getPlanReleaseDate());
            rec.put("標記", marks);
            records.add(rec);
        }
        view.setRows(rows);
        view.getNotes().add(support.note("info", "口徑：" + hint));
        if (page.getTotal() != null && page.getTotal() > records.size()) {
            view.getNotes().add(support.note("warning",
                    "共 " + page.getTotal() + " 條，已列出前 " + records.size() + " 條。"));
        }
        view.setLink(support.link("查看需求跟進清單", "/rdm-requirement"));

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("ok", true);
        content.put("person", personLabel);
        content.put("role", role);
        content.put("total", page.getTotal());
        content.put("returned", records.size());
        content.put("stats", stats);
        content.put("records", records);
        content.put("scope", Map.of("restricted", !support.canSeeAll(user), "hint", hint));
        content.put("note", "明細已由系統卡片渲染，請勿在正文重複；正文只寫結論、異常與建議");
        return new RichOutput(support.json(content), view, null);
    }
}

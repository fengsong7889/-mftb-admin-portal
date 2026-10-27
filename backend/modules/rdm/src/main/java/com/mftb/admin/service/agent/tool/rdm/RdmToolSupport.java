package com.mftb.admin.service.agent.tool.rdm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmProjectFactService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * RDM 工具公共支撑：参数解析、权限门禁、项目/人员解析、视图构建、JSON 输出。
 *
 * <p>权限口径：工具自身只做「菜单级」门禁，真正的数据范围仍由
 * {@link RdmProjectFactService} 与 {@code RdmRequirementService} 在服务层收敛；
 * 两者是 AND 关系，任何一处拒绝都不会返回数据。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmToolSupport {

    /** 项目状态中文标签（与前端 constants/rdm.ts 同源） */
    private static final Map<String, String> PROJECT_STATUS_LABEL = Map.of(
            "preparing", "籌備中",
            "in_progress", "進行中",
            "partial_delivered", "部分交付",
            "all_delivered", "全部交付",
            "closed", "已關閉");

    private static final Map<String, String> ITERATION_STATUS_LABEL = Map.of(
            "planning", "規劃中",
            "active", "進行中",
            "closed", "已關閉");

    private static final Map<String, String> ITERATION_TYPE_LABEL = Map.of(
            "sprint", "常規迭代",
            "version", "版本專項",
            "hotfix", "緊急修復");

    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final RdmAccessGuard accessGuard;
    private final RdmConfigService configService;
    private final RdmProjectFactService factService;
    private final SysUserMapper sysUserMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    /* ────────────────── 身份与权限 ────────────────── */

    public SysUser currentUser() {
        return operatorResolver.currentUser();
    }

    /**
     * 菜单级门禁：任意一个 {@code menu:action} 命中即放行。
     * <p>返回 null 表示通过；非 null 是可直接回填给模型的错误 JSON。
     */
    public String requireAny(SysUser user, String... menuActions) {
        if (user == null) {
            return error("未取得登錄身份", "請重新登錄後再使用 AI 助手");
        }
        if (operatorResolver.isAdmin(user)) {
            return null;
        }
        for (String entry : menuActions) {
            if (!StringUtils.hasText(entry) || !entry.contains(":")) continue;
            int idx = entry.indexOf(':');
            String menu = entry.substring(0, idx);
            String action = entry.substring(idx + 1);
            if (permissionService.hasPermission(user, menu, action)) {
                return null;
            }
        }
        return error("您沒有產研交付的查看權限",
                "請聯繫管理員開通「項目總覽」「需求跟進清單」或「個人工作台」的查看權限");
    }

    public boolean canSeeAll(SysUser user) {
        return user != null && accessGuard.canSeeAll(user);
    }

    /** 推送权：与“能看项目”分开；确认接口还会再校验一次。 */
    public boolean canPush(SysUser user) {
        if (user == null) return false;
        if (operatorResolver.isAdmin(user)) return true;
        return permissionService.hasPermission(user, RdmConstants.MENU_DASHBOARD_PROJECT, RdmConstants.ACTION_NOTIFY);
    }

    public RdmFactVO.Scope scope(SysUser user) {
        return factService.resolveScope(user == null ? null : user.getId());
    }

    /** 数据范围提示：正文与卡片都必须能看出“只给了自己相关数据”。 */
    public String scopeHint(SysUser user) {
        return canSeeAll(user)
                ? "全部數據（您有全量查看權）"
                : "僅顯示與您相關的數據（提出 / 產品 / 研發 / 驗收 / 任務負責）";
    }

    /* ────────────────── 参数 ────────────────── */

    public String argStr(Map<String, Object> args, String key) {
        if (args == null) return null;
        Object v = args.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    public Integer argInt(Map<String, Object> args, String key) {
        String s = argStr(args, key);
        if (s == null) return null;
        try {
            return Integer.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public boolean argBool(Map<String, Object> args, String key) {
        if (args == null) return false;
        Object v = args.get(key);
        if (v instanceof Boolean b) return b;
        if (v == null) return false;
        String s = String.valueOf(v).trim();
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "yes".equalsIgnoreCase(s);
    }

    /** 行数上限：默认 10，最多 20；避免模型一次把全库拉进上下文。 */
    public int limit(Map<String, Object> args, int def, int max) {
        Integer v = argInt(args, "limit");
        if (v == null || v < 1) return def;
        return Math.min(v, max);
    }

    /* ────────────────── 项目 / 人员解析 ────────────────── */

    /** 项目解析结果：要么唯一命中，要么给出候选让模型追问。 */
    public record ProjectLookup(RdmProject project, List<Map<String, Object>> candidates,
                                String error, String hint) {
        static ProjectLookup ok(RdmProject p) { return new ProjectLookup(p, List.of(), null, null); }
        static ProjectLookup ambiguous(List<Map<String, Object>> c) {
            return new ProjectLookup(null, c, "找到多個匹配的項目，請確認是哪一個", "請用項目編號或完整名稱再試一次");
        }
        static ProjectLookup fail(String e, String h) { return new ProjectLookup(null, List.of(), e, h); }
        public boolean ok() { return project != null; }
    }

    public ProjectLookup resolveProject(String raw, SysUser user) {
        if (user == null || user.getId() == null) return ProjectLookup.fail("未取得登錄身份", "請重新登錄後再試");
        if (!StringUtils.hasText(raw)) {
            return ProjectLookup.fail("請提供項目編號或名稱", "例如：PROJ2026090101 或 會員改版");
        }
        String kw = raw.trim();
        List<Map<String, Object>> rows;
        try {
            RdmFactVO.Scope scope = factService.resolveLookupScope(user.getId());
            if (scope == null || !scope.isAuthenticated()
                    || !scope.isCanSeeAll() && (scope.getProjectIds() == null || scope.getProjectIds().isEmpty())) {
                return ProjectLookup.fail("未找到可查看的項目", "請確認項目編號與權限");
            }
            List<Object> params = new ArrayList<>(List.of(kw, "%" + kw + "%"));
            String restriction = "";
            if (!scope.isCanSeeAll()) {
                restriction = "AND id IN (" + String.join(",", java.util.Collections.nCopies(scope.getProjectIds().size(), "?")) + ") ";
                params.addAll(scope.getProjectIds());
            }
            params.add(kw);
            rows = jdbcTemplate.queryForList(
                    "SELECT id, project_no, name, status FROM rdm_project "
                            + "WHERE (project_no = ? OR name LIKE ?) " + restriction
                            + "ORDER BY (project_no = ?) DESC, id DESC LIMIT 6", params.toArray());
            // 读取后复核撤权；任何权限查询异常都由外层 fail-closed 处理。
            List<Map<String, Object>> visible = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                try {
                    factService.requireProjectVisible(((Number) row.get("id")).longValue(), user.getId());
                    visible.add(row);
                } catch (BusinessException denied) {
                    // 无权候选不参与消歧、数量或唯一命中判断。
                }
            }
            rows = visible;
        } catch (Exception e) {
            log.warn("[RdmTool] 项目解析失败 raw={}: {}", raw, e.getMessage());
            return ProjectLookup.fail("查詢項目失敗", "請稍後再試");
        }
        if (rows.isEmpty()) {
            return ProjectLookup.fail("未找到可查看的項目", "請確認項目編號與權限");
        }
        // 唯一命中：编号精确或名称精确
        List<Map<String, Object>> exact = rows.stream()
                .filter(r -> kw.equals(String.valueOf(r.get("project_no"))) || kw.equals(String.valueOf(r.get("name"))))
                .toList();
        Map<String, Object> chosen = exact.size() == 1 ? exact.get(0) : (rows.size() == 1 ? rows.get(0) : null);
        if (chosen == null) {
            List<Map<String, Object>> candidates = rows.stream().map(r -> {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("項目編號", r.get("project_no"));
                c.put("項目名稱", r.get("name"));
                c.put("狀態", projectStatusLabel(String.valueOf(r.get("status"))));
                return c;
            }).toList();
            return ProjectLookup.ambiguous(candidates);
        }
        Long id = ((Number) chosen.get("id")).longValue();
        try {
            // 项目可见性由 factService 统一裁决（fail-closed，非成员/非责任人拒绝）
            RdmProject project = factService.requireProjectVisible(id, user == null ? null : user.getId());
            return ProjectLookup.ok(project);
        } catch (BusinessException e) {
            return ProjectLookup.fail("未找到可查看的項目", "請確認項目編號與權限");
        } catch (Exception e) {
            log.warn("[RdmTool] 项目可见性校验失败 id={}: {}", id, e.getMessage());
            return ProjectLookup.fail("無法查看該項目", "請稍後再試");
        }
    }

    /** 人员解析结果。 */
    public record PersonLookup(SysUser user, List<Map<String, Object>> candidates,
                               String error, String hint) {
        static PersonLookup ok(SysUser u) { return new PersonLookup(u, List.of(), null, null); }
        static PersonLookup ambiguous(List<Map<String, Object>> c) {
            return new PersonLookup(null, c, "找到多位匹配的員工，請確認是哪一位", "請用姓名加工號再試一次");
        }
        static PersonLookup fail(String e, String h) { return new PersonLookup(null, List.of(), e, h); }
        public boolean ok() { return user != null; }
    }

    public PersonLookup resolvePerson(String raw, SysUser caller) {
        if (caller == null || caller.getId() == null) return PersonLookup.fail("未取得登錄身份", "請重新登錄後再試");
        if (!StringUtils.hasText(raw)) {
            return PersonLookup.fail("請提供員工姓名或工號", "例如：張三 或 MF00001");
        }
        String kw = raw.trim();
        List<Map<String, Object>> rows;
        try {
            boolean all = canSeeAll(caller);
            List<Object> params = new ArrayList<>(List.of(kw, "%" + kw + "%"));
            if (!all) params.add(caller.getId());
            params.add(kw);
            rows = jdbcTemplate.queryForList(
                    "SELECT id, name, emp_id FROM sys_user WHERE status = 1 "
                            + "AND (emp_id = ? OR name LIKE ?) " + (all ? "" : "AND id = ? ")
                            + "ORDER BY (emp_id = ?) DESC, name LIMIT 6", params.toArray());
        } catch (Exception e) {
            log.warn("[RdmTool] 人员解析失败 raw={}: {}", raw, e.getMessage());
            return PersonLookup.fail("查詢員工失敗", "請稍後再試");
        }
        if (rows.isEmpty()) {
            return PersonLookup.fail("未找到員工「" + kw + "」", "請確認姓名或工號是否正確，且該員工在職");
        }
        List<Map<String, Object>> exact = rows.stream()
                .filter(r -> kw.equals(String.valueOf(r.get("emp_id"))) || kw.equals(String.valueOf(r.get("name"))))
                .toList();
        Map<String, Object> chosen = exact.size() == 1 ? exact.get(0) : (rows.size() == 1 ? rows.get(0) : null);
        if (chosen == null) {
            List<Map<String, Object>> candidates = rows.stream().map(r -> {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("姓名", r.get("name"));
                c.put("工號", r.get("emp_id"));
                return c;
            }).toList();
            return PersonLookup.ambiguous(candidates);
        }
        SysUser user = sysUserMapper.selectById(((Number) chosen.get("id")).longValue());
        if (user == null || !Integer.valueOf(1).equals(user.getStatus())
                || !sameUser(caller, user) && !canSeeAll(caller)) {
            return PersonLookup.fail("未找到可查看的員工", "請確認姓名、工號及權限");
        }
        return PersonLookup.ok(user);
    }

    /* ────────────────── 状态/标签 ────────────────── */

    public String requirementStatusLabel(String code) {
        if (code == null) return null;
        try {
            return configService.statusLabelMap().getOrDefault(code, code);
        } catch (Exception e) {
            return code;
        }
    }

    public String projectStatusLabel(String code) {
        return code == null ? null : PROJECT_STATUS_LABEL.getOrDefault(code, code);
    }

    public String iterationStatusLabel(String code) {
        return code == null ? null : ITERATION_STATUS_LABEL.getOrDefault(code, code);
    }

    public String iterationTypeLabel(String code) {
        return code == null ? null : ITERATION_TYPE_LABEL.getOrDefault(code, code);
    }

    /**
     * 语义阶段桶 → 需求状态集合。
     * <p>模型不需要记住 23 个内部状态码；它只需要说“待审批/待分配/开发中”，
     * 映射放在服务端，口径与页面同源。
     */
    public List<String> statusesOfStage(String stage) {
        if (!StringUtils.hasText(stage)) return List.of();
        return switch (stage.trim().toLowerCase()) {
            case "draft" -> List.of("draft");
            case "approval_pending" -> List.of("intake_pending");
            case "approval_rejected" -> List.of("intake_rejected");
            case "unassigned" -> List.of("pool");
            case "assigned" -> List.of("assigned");
            case "evaluating" -> List.of("evaluating");
            case "prd" -> List.of("accepted", "prd_designing");
            case "review" -> List.of("reviewing", "review_passed");
            case "scheduled" -> List.of("scheduled");
            case "developing" -> List.of("designing", "developing", "integration");
            case "testing" -> List.of("testing", "test_passed");
            case "acceptance" -> List.of("uat_pending", "uat_rejected", "released");
            case "done" -> List.of("verified", "closed");
            case "on_hold" -> List.of("on_hold");
            case "rejected" -> List.of("rejected");
            default -> List.of();
        };
    }

    /* ────────────────── 视图构建 ────────────────── */

    public AgentView view(String id, String title, String subtitle) {
        AgentView v = new AgentView();
        v.setId(id);
        v.setKind("table");
        v.setTitle(title);
        v.setSubtitle(subtitle);
        return v;
    }

    public AgentView.Metric metric(String label, Object value, String unit, String tone) {
        AgentView.Metric m = new AgentView.Metric();
        m.setLabel(label);
        m.setValue(value);
        m.setUnit(unit);
        m.setTone(tone);
        return m;
    }

    public AgentView.Column column(String key, String title, String type, Integer width) {
        AgentView.Column c = new AgentView.Column();
        c.setKey(key);
        c.setTitle(title);
        c.setType(type == null ? "text" : type);
        c.setWidth(width);
        return c;
    }

    public AgentView.Note note(String tone, String text) {
        AgentView.Note n = new AgentView.Note();
        n.setTone(tone);
        n.setText(text);
        return n;
    }

    public AgentView.Link link(String label, String route) {
        if (route == null || !route.startsWith("/") || route.startsWith("//")) return null;
        AgentView.Link l = new AgentView.Link();
        l.setLabel(label);
        l.setRoute(route);
        return l;
    }

    /* ────────────────── JSON / 文本 ────────────────── */

    public String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return error("結果序列化失敗", "請稍後再試");
        }
    }

    /** 错误 JSON 必须让 error 成为第一个键：编排层用 startsWith 判定失败。 */
    public String error(String message, String hint) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", message == null ? "unknown" : message);
        if (StringUtils.hasText(hint)) m.put("hint", hint);
        return json(m);
    }

    public String progressText(int done, int total) {
        if (total <= 0) return "0/0";
        int pct = (int) Math.round(done * 100.0 / total);
        return done + "/" + total + "（" + pct + "%）";
    }

    public String truncate(String s, int max) {
        if (s == null) return null;
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() <= max ? one : one.substring(0, max) + "…";
    }

    /** 卡片行数据统一去掉 null，避免前端出现 "null" 文本。 */
    public Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object v = kv[i + 1];
            if (v != null) m.put(String.valueOf(kv[i]), v);
        }
        return m;
    }

    public List<Map<String, Object>> candidatesView(List<Map<String, Object>> candidates) {
        return candidates == null ? List.of() : new ArrayList<>(candidates);
    }

    public boolean sameUser(SysUser a, SysUser b) {
        return a != null && b != null && Objects.equals(a.getId(), b.getId());
    }
}

package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * WP09–WP11：策略试算、评测回归与运营观测。
 *
 * <p>本服务不调用模型、不产生业务副作用：
 * <ul>
 *   <li>规则试算：对给定系统与模型返回「准入/拒绝 + 原因」，与真实链路共用同一套策略服务；</li>
 *   <li>评测：按固定用例断言当前策略结果（安全类必须通过），不替代真实业务验收；</li>
 *   <li>运营汇总：运行、提案、预算与工具拒绝的计数，供看板与告警使用。</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class AiPlatformOpsService {

    private final JdbcTemplate jdbc;
    private final AiDataPolicyService dataPolicy;
    private final AiKnowledgeAclService aclService;
    private final ObjectMapper mapper;
    /** 仅供就绪面板展示，执行器真实开关仍在 AgentRunWorker。 */
    @org.springframework.beans.factory.annotation.Value("${ai.run.worker-enabled:false}")
    private boolean workerEnabled;

    /** 规则试算：不调模型、不扣费，只解释当前策略会如何裁决。 */
    public Map<String, Object> evaluatePolicy(String systemCode, String modelKey) {
        Map<String, Object> out = new LinkedHashMap<>();
        String dataClass = dataPolicy.dataClassOf(systemCode);
        out.put("systemCode", systemCode);
        out.put("modelKey", modelKey);
        out.put("dataClass", dataClass);
        out.put("modelCalled", false);
        out.put("billed", false);
        var endpoint = dataPolicy.evaluate(systemCode, modelKey);
        Map<String, Object> decision = new LinkedHashMap<>();
        decision.put("allowed", endpoint.allowed());
        decision.put("reason", endpoint.allowed() ? "ok" : endpoint.errorKind());
        decision.put("message", endpoint.allowed() ? "目前策略允許發送（仍會執行完整准入檢查）" : endpoint.message());
        out.put("decision", decision);
        out.put("nextStep", endpoint.allowed() ? "執行時仍會逐輪複查急停、授權、額度與出域" : "先登記系統分級並批准端點，或改用已批准的私域端點");
        return out;
    }

    /** 某知識文檔當前對該員工是否可讀（不返回正文）。 */
    public Map<String, Object> explainKnowledgeAccess(Long docId, com.mftb.admin.entity.SysUser user) {
        if (docId == null || user == null) throw new BusinessException(400, "缺少文檔或身份");
        boolean readable = aclService.canRead(docId, user);
        return Map.of("docId", docId, "readable", readable,
                "reason", readable ? "matched_acl" : "no_matching_acl",
                "principalCount", aclService.subjects(user).size());
    }

    /**
     * 上线就绪面板：明确指出还缺哪些配置才能真实调用模型 / 检索知识。
     * 只读统计，不改任何配置，也不代替分级与批准的决策。
     */
    public Map<String, Object> readiness() {
        int classes = count("SELECT COUNT(*) FROM ai_data_class_policy");
        int endpoints = count("SELECT COUNT(*) FROM ai_endpoint_approval WHERE status=1");
        int acl = count("SELECT COUNT(*) FROM ai_knowledge_acl");
        int apps = count("SELECT COUNT(*) FROM ai_application WHERE status=1 AND published_version > 0");
        List<String> blocking = new ArrayList<>();
        if (classes == 0) blocking.add("data_class_missing");
        if (endpoints == 0) blocking.add("endpoint_not_approved");
        if (acl == 0) blocking.add("knowledge_acl_missing");
        if (apps == 0) blocking.add("application_not_published");
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("dataClasses", classes);
        counts.put("approvedEndpoints", endpoints);
        counts.put("knowledgeAcls", acl);
        counts.put("publishedApplications", apps);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("workerEnabled", workerEnabled);
        out.put("counts", counts);
        out.put("blocking", blocking);
        out.put("readyForModelCalls", classes > 0 && endpoints > 0);
        out.put("readyForKnowledgeSearch", acl > 0);
        out.put("note", "未就绪时调用会被策略拒绝，这是设计而非故障；workerEnabled 还需同时满足前两项才会执行队列任务");
        return out;
    }

    private int count(String sql) {
        Integer value = jdbc.queryForObject(sql, Integer.class);
        return value == null ? 0 : value;
    }

    /* ────────────────── 评测 ────────────────── */

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveCase(Map<String, Object> body, String operator) {
        String dataset = text(body.get("datasetKey"));
        String caseNo = text(body.get("caseNo"));
        String input = text(body.get("input"));
        if (!StringUtils.hasText(dataset) || !dataset.matches("[a-z][a-z0-9-]{2,63}")) throw new BusinessException("datasetKey 格式不正確");
        if (!StringUtils.hasText(caseNo) || caseNo.length() > 32) throw new BusinessException("請填寫用例編號（≤32）");
        if (!StringUtils.hasText(input) || input.length() > 20_000) throw new BusinessException("請填寫用例輸入（≤20000 字）");
        String expect;
        try {
            expect = mapper.writeValueAsString(body.getOrDefault("expect", Map.of()));
        } catch (Exception e) {
            throw new BusinessException("期望值無法序列化");
        }
        String systemCode = text(body.get("systemCode"));
        jdbc.update("INSERT INTO ai_eval_case(dataset_key, case_no, system_code, actor, input_text, expect_json, must_pass, created_by) "
                        + "VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE input_text=VALUES(input_text), "
                        + "expect_json=VALUES(expect_json), must_pass=VALUES(must_pass), system_code=VALUES(system_code)",
                dataset, caseNo, StringUtils.hasText(systemCode) ? systemCode : "common",
                text(body.get("actor")), input, expect,
                Boolean.FALSE.equals(body.get("mustPass")) ? 0 : 1, operator);
        return jdbc.queryForMap("SELECT * FROM ai_eval_case WHERE dataset_key=? AND case_no=?", dataset, caseNo);
    }

    public List<Map<String, Object>> listCases(String datasetKey) {
        if (StringUtils.hasText(datasetKey)) {
            return jdbc.queryForList("SELECT * FROM ai_eval_case WHERE dataset_key=? ORDER BY case_no", datasetKey);
        }
        return jdbc.queryForList("SELECT * FROM ai_eval_case ORDER BY dataset_key, case_no LIMIT 500");
    }

    /**
     * 运行评测：对每个用例断言「系统已分级 + 端点批准等级足够」是否符合期望；
     * 不做模型调用，因此可以在发布前反复跑，且不会产生费用。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> runDataset(String datasetKey, String appKey, String operator) {
        List<Map<String, Object>> cases = listCases(datasetKey);
        if (cases.isEmpty()) throw new BusinessException(404, "該數據集沒有用例");
        int passed = 0;
        int failed = 0;
        List<Map<String, Object>> detail = new ArrayList<>();
        for (Map<String, Object> row : cases) {
            String systemCode = String.valueOf(row.get("system_code"));
            Map<String, Object> expect = parseExpect(String.valueOf(row.get("expect_json")));
            String modelKey = expect.get("modelKey") == null ? null : String.valueOf(expect.get("modelKey"));
            boolean allowed = dataPolicy.evaluate(systemCode, modelKey).allowed();
            Boolean expectAllowed = expect.get("allowed") instanceof Boolean b ? b : null;
            boolean ok = expectAllowed == null || expectAllowed == allowed;
            if (Boolean.TRUE.equals(row.get("must_pass")) && expectAllowed != null && !ok) ok = false;
            if (ok) passed++; else failed++;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("caseNo", row.get("case_no"));
            item.put("systemCode", systemCode);
            item.put("expected", expectAllowed);
            item.put("actual", allowed);
            item.put("passed", ok);
            detail.add(item);
        }
        String detailJson;
        try {
            detailJson = mapper.writeValueAsString(detail);
        } catch (Exception e) {
            throw new BusinessException("評測結果無法序列化");
        }
        jdbc.update("INSERT INTO ai_eval_run(dataset_key, app_key, total, passed, failed, detail_json, started_by) "
                        + "VALUES(?,?,?,?,?,?,?)", datasetKey, appKey, cases.size(), passed, failed, detailJson, operator);
        // 安全类用例失败时明确返回阻断标记，发布流程应据此拒绝放行。
        boolean blocking = failed > 0;
        return Map.of("datasetKey", datasetKey, "total", cases.size(), "passed", passed, "failed", failed,
                "blocking", blocking, "detail", detail);
    }

    public List<Map<String, Object>> listRuns(String datasetKey) {
        if (StringUtils.hasText(datasetKey)) {
            return jdbc.queryForList("SELECT id, dataset_key, app_key, total, passed, failed, started_by, created_at "
                    + "FROM ai_eval_run WHERE dataset_key=? ORDER BY id DESC LIMIT 100", datasetKey);
        }
        return jdbc.queryForList("SELECT id, dataset_key, app_key, total, passed, failed, started_by, created_at "
                + "FROM ai_eval_run ORDER BY id DESC LIMIT 100");
    }

    /* ────────────────── 运营汇总 ────────────────── */

    public Map<String, Object> summary() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("runsByStatus", pairs("SELECT status AS k, COUNT(*) c FROM ai_run GROUP BY status", "k"));
        out.put("proposalsByStatus", pairs("SELECT status AS k, COUNT(*) c FROM ai_action_proposal GROUP BY status", "k"));
        out.put("toolDenials", pairs("SELECT reject_reason AS k, COUNT(*) c FROM ai_tool_exec_log "
                + "WHERE decision IN ('reject','approval_required') GROUP BY reject_reason", "k"));
        out.put("poolsNearLimit", jdbc.queryForList("SELECT scope_type, scope_key, period, limit_amount, reserved_amount, "
                + "used_amount FROM ai_budget_pool WHERE status=1 AND limit_amount > 0 "
                + "AND (used_amount + reserved_amount) / limit_amount >= 0.8 ORDER BY updated_at DESC LIMIT 50"));
        out.put("unreconciledReceipts", jdbc.queryForObject(
                "SELECT COUNT(*) FROM ai_action_receipt WHERE status='unknown' AND reconciled=0", Integer.class));
        return out;
    }

    private List<Map<String, Object>> pairs(String sql, String keyColumn) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", String.valueOf(row.get(keyColumn)));
            item.put("count", ((Number) row.get("c")).longValue());
            out.add(item);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseExpect(String json) {
        if (!StringUtils.hasText(json)) return Map.of();
        try {
            return mapper.readValue(json, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String text(Object v) { return v == null ? null : String.valueOf(v).trim(); }
}

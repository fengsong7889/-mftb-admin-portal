package com.mftb.admin.service.agent.platform;

import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据分级与模型端点批准（解锁「出站检查」的可信依据）。
 *
 * <p>规则：业务系统的数据等级 ≤ 端点批准等级才允许发送；未登记系统或未批准端点一律拒绝。
 * 端点上的 {@code private} 标签只是部署事实，不是批准；管理员必须显式登记 maxDataClass。
 * 等级：PUBLIC &lt; INTERNAL &lt; SENSITIVE &lt; RESTRICTED。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiDataPolicyService {

    public static final List<String> LEVELS = List.of("PUBLIC", "INTERNAL", "SENSITIVE", "RESTRICTED");

    /**
     * 共用作用域：个人工作台/门户等无业务系统上下文的请求按此登记项判定。
     * <p>早期实现对空 systemCode 直接返回未分级，导致该场景无法通过任何配置放行；
     * 归一化后仍需显式登记 common，未登记依旧拒绝（fail-closed 不变）。
     */
    public static final String COMMON_SCOPE = "common";
    /** 个人工作台哨兵（与前端 SystemCode.PORTAL 同值）：不属于业务系统，与空白同样按共用判定。 */
    private static final String PORTAL_SENTINEL = "portal";

    private final JdbcTemplate jdbc;

    public record Decision(boolean allowed, String errorKind, String message) { }

    public String dataClassOf(String systemCode) {
        // 空作用域（个人工作台/门户）归一为 common 再查：common 未登记仍然返回 null 并被拒绝。
        String scope = scopeOf(systemCode);
        List<String> rows = jdbc.queryForList(
                "SELECT data_class FROM ai_data_class_policy WHERE system_code=?", String.class, scope);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 作用域归一：空白与 portal 哨兵（不属于任何业务系统）统一按 common 判定。
     * <p>不改变 fail-closed：common 未登记依旧返回 null 并被拒绝。
     */
    private static String scopeOf(String systemCode) {
        if (!StringUtils.hasText(systemCode)) return COMMON_SCOPE;
        return PORTAL_SENTINEL.equalsIgnoreCase(systemCode.trim()) ? COMMON_SCOPE : systemCode;
    }

    public Decision evaluate(String systemCode, String modelKey) {
        String scope = scopeOf(systemCode);
        String dataClass = dataClassOf(scope);
        if (dataClass == null) {
            // 拒绝是安全基线，但必须让管理员看到具体作用域，否则不知道去登记哪个系统。
            log.warn("[DataPolicy] 拒绝外发：业务系统未登记分级 scope={} model={}", scope, modelKey);
            return new Decision(false, "data_class_unclassified",
                    "該業務系統尚未分級，禁止發送模型（作用域：" + scope + "）");
        }
        if (!StringUtils.hasText(modelKey)) {
            return new Decision(false, "endpoint_unknown", "無法確認模型端點，禁止發送");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT max_data_class, status, expires_at FROM ai_endpoint_approval WHERE model_key=?", modelKey);
        if (rows.isEmpty()) {
            return new Decision(false, "endpoint_not_approved", "模型端點尚未完成數據准入批准");
        }
        Map<String, Object> row = rows.get(0);
        if (!Integer.valueOf(1).equals(((Number) row.get("status")).intValue())) {
            return new Decision(false, "endpoint_disabled", "模型端點批准已停用");
        }
        Object expires = row.get("expires_at");
        if (expires instanceof java.sql.Timestamp ts && ts.toLocalDateTime().isBefore(java.time.LocalDateTime.now())) {
            return new Decision(false, "endpoint_expired", "模型端點批准已過期");
        }
        if (rank(String.valueOf(row.get("max_data_class"))) < rank(dataClass)) {
            return new Decision(false, "data_class_exceeded", "資料等級超出端點批准範圍");
        }
        return new Decision(true, null, null);
    }

    public List<Map<String, Object>> listSystemPolicies() {
        return jdbc.queryForList("SELECT system_code, data_class, note, updated_by, updated_at "
                + "FROM ai_data_class_policy ORDER BY system_code");
    }

    public List<Map<String, Object>> listEndpoints() {
        return jdbc.queryForList("SELECT id, model_key, max_data_class, residency, status, approved_by, approved_at, "
                + "expires_at, note FROM ai_endpoint_approval ORDER BY id DESC LIMIT 200");
    }

    /**
     * 系统下拉选项：复用门户/权限共用的 sys_system 清单，不在 AI 侧维护第二份系统字典。
     * <p>只返回启用且未删除项；中文名由 name 提供，英文名用于非中文界面。
     */
    public List<Map<String, Object>> listSystemOptions() {
        List<Map<String, Object>> rows = new ArrayList<>(jdbc.queryForList(
                "SELECT code, name, name_en FROM sys_system "
                        + "WHERE status = 1 AND deleted = 0 ORDER BY sort_order ASC, code ASC"));
        // common 不在 sys_system 里（它是「无业务系统上下文」的哨兵），但必须能登记分级，
        // 否则个人工作台/门户问答永远被拒且没有配置入口。放首位，避免被忽略。
        Map<String, Object> shared = new LinkedHashMap<>();
        shared.put("code", COMMON_SCOPE);
        shared.put("name", "共用（個人工作台/門戶）");
        shared.put("name_en", "Shared (Personal Workbench)");
        rows.add(0, shared);
        return rows;
    }

    /** 模型下拉选项：端点批准以 model_key 为唯一键，选项必须与「模型管理」同源（ai_model）。 */
    public List<Map<String, Object>> listModelOptions() {
        return jdbc.queryForList("SELECT model_key, name, deploy_type, status FROM ai_model "
                + "WHERE deleted = 0 ORDER BY status DESC, sort_order ASC, id ASC");
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveSystemPolicy(String systemCode, String dataClass, String note, String operator) {
        if (!StringUtils.hasText(systemCode) || !systemCode.matches("[a-z][a-z0-9-]{1,31}")) {
            throw new BusinessException("systemCode 格式不正確");
        }
        String level = normalizeLevel(dataClass);
        jdbc.update("INSERT INTO ai_data_class_policy(system_code, data_class, note, updated_by) VALUES(?,?,?,?) "
                        + "ON DUPLICATE KEY UPDATE data_class=VALUES(data_class), note=VALUES(note), updated_by=VALUES(updated_by)",
                systemCode, level, note == null ? null : note.substring(0, Math.min(note.length(), 255)), operator);
        return jdbc.queryForMap("SELECT * FROM ai_data_class_policy WHERE system_code=?", systemCode);
    }

    /** 端点批准必须显式给出等级与有效期；默认 90 天，到期自动失效。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveEndpoint(String modelKey, String maxDataClass, String residency,
                                               Integer days, String note, String operator) {
        if (!StringUtils.hasText(modelKey) || modelKey.length() > 128) throw new BusinessException("請填寫模型標識");
        String level = normalizeLevel(maxDataClass);
        String place = StringUtils.hasText(residency) ? residency.trim().toLowerCase() : "external";
        if (!"private".equals(place) && !"external".equals(place)) {
            throw new BusinessException(400, "residency 只能是 private 或 external，實際收到: " + residency);
        }
        int ttl = days == null || days < 1 || days > 365 ? 90 : days;
        jdbc.update("INSERT INTO ai_endpoint_approval(model_key, max_data_class, residency, status, approved_by, approved_at, expires_at, note) "
                        + "VALUES(?,?,?,1,?,NOW(),?,?) ON DUPLICATE KEY UPDATE max_data_class=VALUES(max_data_class), "
                        + "residency=VALUES(residency), status=1, approved_by=VALUES(approved_by), approved_at=NOW(), "
                        + "expires_at=VALUES(expires_at), note=VALUES(note)",
                modelKey, level, place, operator, java.time.LocalDateTime.now().plusDays(ttl),
                note == null ? null : note.substring(0, Math.min(note.length(), 255)));
        log.info("[DataPolicy] 端点批准 model={} maxClass={} residency={} days={} by={}",
                modelKey, level, place, ttl, operator);
        return jdbc.queryForMap("SELECT * FROM ai_endpoint_approval WHERE model_key=?", modelKey);
    }

    @Transactional(rollbackFor = Exception.class)
    public void revokeEndpoint(String modelKey) {
        jdbc.update("UPDATE ai_endpoint_approval SET status=0 WHERE model_key=?", modelKey);
    }

    private static String normalizeLevel(String raw) {
        String level = raw == null ? "" : raw.trim().toUpperCase(java.util.Locale.ROOT);
        if (!LEVELS.contains(level)) throw new BusinessException("數據等級僅支持 PUBLIC/INTERNAL/SENSITIVE/RESTRICTED");
        return level;
    }

    private static int rank(String level) {
        int idx = LEVELS.indexOf(level == null ? "" : level.toUpperCase(java.util.Locale.ROOT));
        return idx < 0 ? -1 : idx;
    }
}

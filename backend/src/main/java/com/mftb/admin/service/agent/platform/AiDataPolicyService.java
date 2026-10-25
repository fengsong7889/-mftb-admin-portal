package com.mftb.admin.service.agent.platform;

import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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

    private final JdbcTemplate jdbc;

    public record Decision(boolean allowed, String errorKind, String message) { }

    public String dataClassOf(String systemCode) {
        if (!StringUtils.hasText(systemCode)) return null;
        List<String> rows = jdbc.queryForList(
                "SELECT data_class FROM ai_data_class_policy WHERE system_code=?", String.class, systemCode);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public Decision evaluate(String systemCode, String modelKey) {
        String dataClass = dataClassOf(systemCode);
        if (dataClass == null) {
            return new Decision(false, "data_class_unclassified", "該業務系統尚未分級，禁止發送模型");
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

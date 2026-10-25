package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * WP07：动作提案。审批绑定的是「这一份冻结参数」，不是某个字符串凭证。
 *
 * <p>关键约束：
 * <ul>
 *   <li>参数规范化后哈希；参数、目标资源版本、申请人事后变化都必须重新提案与审批；</li>
 *   <li>审批通过后只能消费一次（CAS approved→executing），过期、撤销、已消费一律拒绝；</li>
 *   <li>外部结果未知时先记 unknown，禁止因为超时自动重发；对账完成再置 delivered/failed；</li>
 *   <li>OA 仍是审批事实来源，本服务只存引用，不复制审批状态机。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiActionProposalService {

    private static final int DEFAULT_TTL_MINUTES = 30;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public record Consumed(long proposalId, String proposalNo, String toolKey, String paramsJson) { }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> prepare(String toolKey, Map<String, Object> params, String requester,
                                       String targetResource, String targetVersion, String impactSummary,
                                       Integer ttlMinutes) {
        if (!StringUtils.hasText(toolKey) || params == null) throw new BusinessException("缺少工具或參數");
        String canonical = canonicalJson(params);
        String hash = sha256(canonical);
        String idempotencyKey = sha256(toolKey + "|" + hash + "|" + requester + "|"
                + nullToEmpty(targetResource) + "|" + nullToEmpty(targetVersion));
        List<Map<String, Object>> existing = jdbc.queryForList(
                "SELECT proposal_no, status, expires_at, params_json FROM ai_action_proposal WHERE idempotency_key=?",
                idempotencyKey);
        if (!existing.isEmpty()) {
            Map<String, Object> row = existing.get(0);
            return Map.of("proposalNo", row.get("proposal_no"), "status", row.get("status"),
                    "expiresAt", String.valueOf(row.get("expires_at")), "paramsHash", hash, "reused", true);
        }
        String proposalNo = "AP" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
                .format(LocalDateTime.now()) + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        int ttl = ttlMinutes == null || ttlMinutes < 1 || ttlMinutes > 1440 ? DEFAULT_TTL_MINUTES : ttlMinutes;
        jdbc.update("INSERT INTO ai_action_proposal(proposal_no, tool_key, tool_version, params_json, params_hash, "
                        + "target_resource, target_version, impact_summary, requester, status, expires_at, idempotency_key) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                proposalNo, toolKey, 1, canonical, hash, truncate(targetResource, 255), truncate(targetVersion, 64),
                truncate(impactSummary, 512), requester, "pending",
                LocalDateTime.now().plusMinutes(ttl), idempotencyKey);
        log.info("[ActionProposal] 新建提案 no={} tool={} requester={}", proposalNo, toolKey, requester);
        return get(proposalNo);
    }

    public Map<String, Object> get(String proposalNo) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM ai_action_proposal WHERE proposal_no=?", proposalNo);
        if (rows.isEmpty()) throw new BusinessException(404, "動作提案不存在");
        Map<String, Object> row = new LinkedHashMap<>(rows.get(0));
        row.remove("params_json");
        row.put("receipt", receipts(((Number) row.get("id")).longValue()));
        return row;
    }

    /** 执行端读取冻结参数专用：只返回 params_json，不暴露给普通详情接口。 */
    public String rawParams(String proposalNo) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT params_json FROM ai_action_proposal WHERE proposal_no=?", proposalNo);
        return rows.isEmpty() ? null : String.valueOf(rows.get(0).get("params_json"));
    }

    /** 审批通过：只允许 pending→approved；过期提案不允许补批。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approve(String proposalNo, String approvalRef, String approver) {
        if (!StringUtils.hasText(approvalRef)) throw new BusinessException("請提供審批引用（OA 流程號等）");
        int updated = jdbc.update("UPDATE ai_action_proposal SET status='approved', approval_ref=?, approved_by=?, approved_at=NOW() "
                        + "WHERE proposal_no=? AND status='pending' AND expires_at > NOW()",
                truncate(approvalRef, 128), approver, proposalNo);
        if (updated == 0) throw new BusinessException(409, "提案不存在、已處理或已過期，不能審批");
        return get(proposalNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> reject(String proposalNo, String reason, String approver) {
        int updated = jdbc.update("UPDATE ai_action_proposal SET status='rejected', approved_by=?, approved_at=NOW(), "
                        + "impact_summary=CONCAT(COALESCE(impact_summary,''), ' | reject: ', ?) "
                        + "WHERE proposal_no=? AND status='pending'",
                approver, truncate(reason, 200), proposalNo);
        if (updated == 0) throw new BusinessException(409, "提案不存在或已處理");
        return get(proposalNo);
    }

    /**
     * 执行前一次性消费：requester、toolKey、参数哈希、有效期、状态全部匹配才放行。
     * 返回冻结参数，调用方必须用这份参数执行，不能改用请求里另传的参数。
     */
    @Transactional(rollbackFor = Exception.class)
    public Consumed consume(String proposalNo, String requester, String toolKey, String argsDigest) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM ai_action_proposal WHERE proposal_no=? FOR UPDATE", proposalNo);
        if (rows.isEmpty()) throw new BusinessException(403, "動作提案不存在");
        Map<String, Object> row = rows.get(0);
        if (!"approved".equals(row.get("status"))) throw new BusinessException(403, "動作提案尚未通過審批或已被消費");
        if (!requester.equals(row.get("requester"))) throw new BusinessException(403, "只能執行本人提出的動作");
        if (!toolKey.equals(row.get("tool_key"))) throw new BusinessException(403, "工具與提案不一致");
        if (!argsDigest.equals(row.get("params_hash"))) throw new BusinessException(403, "參數與已審批內容不一致，請重新提案");
        java.sql.Timestamp expires = (java.sql.Timestamp) row.get("expires_at");
        if (expires == null || expires.toLocalDateTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException(403, "動作提案已過期，請重新提案並審批");
        }
        int updated = jdbc.update("UPDATE ai_action_proposal SET status='executing', consumed_at=NOW() "
                + "WHERE id=? AND status='approved'", ((Number) row.get("id")).longValue());
        if (updated == 0) throw new BusinessException(409, "動作提案已被其他請求消費");
        return new Consumed(((Number) row.get("id")).longValue(), proposalNo, toolKey,
                String.valueOf(row.get("params_json")));
    }

    /** 记录回执；外部超时可能已成功，状态必须允许 unknown 并等待对账。 */
    @Transactional(rollbackFor = Exception.class)
    public void recordReceipt(long proposalId, String status, String externalRef, String detail, String payloadDigest) {
        if (!List.of("accepted", "delivered", "failed", "unknown").contains(status)) {
            throw new BusinessException("不支持的回執狀態");
        }
        String proposalStatus = switch (status) {
            case "failed" -> "failed";
            case "unknown" -> "unknown";
            default -> "executed";
        };
        jdbc.update("INSERT INTO ai_action_receipt(proposal_id, status, external_ref, payload_digest, detail) "
                        + "VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status), external_ref=VALUES(external_ref), "
                        + "detail=VALUES(detail), payload_digest=VALUES(payload_digest)",
                proposalId, status, truncate(externalRef, 128), truncate(payloadDigest, 64), truncate(detail, 512));
        jdbc.update("UPDATE ai_action_proposal SET status=? WHERE id=?", proposalStatus, proposalId);
    }

    /** 外部执行网关用：按提案号写回执；提案不存在时返回 false，不阻断工具主链路。 */
    public boolean recordReceiptByNo(String proposalNo, String status, String externalRef,
                                     String detail, String payloadDigest) {
        if (!StringUtils.hasText(proposalNo)) return false;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id FROM ai_action_proposal WHERE proposal_no=?", proposalNo);
        if (rows.isEmpty()) return false;
        recordReceipt(((Number) rows.get(0).get("id")).longValue(), status, externalRef, detail, payloadDigest);
        return true;
    }

    /** 人工对账：unknown→delivered/failed，并标记 reconciled。 */
    @Transactional(rollbackFor = Exception.class)
    public void reconcile(String proposalNo, boolean delivered, String detail) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id FROM ai_action_proposal WHERE proposal_no=? AND status='unknown'", proposalNo);
        if (rows.isEmpty()) throw new BusinessException(409, "只有「結果待核實」的提案需要對賬");
        long id = ((Number) rows.get(0).get("id")).longValue();
        jdbc.update("UPDATE ai_action_receipt SET reconciled=1, status=?, detail=CONCAT(COALESCE(detail,''), ' | ', ?) "
                + "WHERE proposal_id=?", delivered ? "delivered" : "failed", truncate(detail, 200), id);
        jdbc.update("UPDATE ai_action_proposal SET status=? WHERE id=?", delivered ? "executed" : "failed", id);
    }

    public List<Map<String, Object>> list(String requester, String status) {
        StringBuilder sql = new StringBuilder("SELECT proposal_no, tool_key, target_resource, status, requester, "
                + "approval_ref, expires_at, created_at FROM ai_action_proposal WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(requester)) { sql.append(" AND requester=?"); args.add(requester); }
        if (StringUtils.hasText(status)) { sql.append(" AND status=?"); args.add(status); }
        sql.append(" ORDER BY id DESC LIMIT 200");
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    /** 过期清理：只把仍 pending 的置 expired，不动已审批未执行（后者靠执行时复核）。 */
    @Transactional(rollbackFor = Exception.class)
    public int expireStale() {
        return jdbc.update("UPDATE ai_action_proposal SET status='expired' WHERE status='pending' AND expires_at < NOW()");
    }

    private List<Map<String, Object>> receipts(long proposalId) {
        return jdbc.queryForList("SELECT status, external_ref, detail, reconciled, created_at "
                + "FROM ai_action_receipt WHERE proposal_id=?", proposalId);
    }

    /** 规范化 JSON：key 排序 + 去空白，保证同一语义得到同一哈希。 */
    public String canonicalJson(Object value) {
        try {
            return mapper.writeValueAsString(sort(value));
        } catch (Exception e) {
            throw new BusinessException("參數無法序列化");
        }
    }

    private static Object sort(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sorted = new TreeMap<>();
            map.forEach((k, v) -> sorted.put(String.valueOf(k), sort(v)));
            return sorted;
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            list.forEach(v -> out.add(sort(v)));
            return out;
        }
        return value;
    }

    public String sha256(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }
    private static String truncate(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }
}

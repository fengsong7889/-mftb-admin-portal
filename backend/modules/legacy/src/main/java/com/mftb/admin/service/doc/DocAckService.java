package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.dto.DocNativeDTO.Head;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 制度签收（P1a）：
 * - 只对当前生效版本签收；
 * - 范围主体 DEPT/ROLE/ALL，不为每个员工生成目标行；
 * - 回执 (node,revision,user) 唯一，重复点击幂等；
 * - 待签收列表复用统一检索的 ACL/密级过滤，不在内存裁剪。
 */
@Service
@RequiredArgsConstructor
public class DocAckService {
    private static final Set<String> SUBJECT_TYPES = Set.of("DEPT", "ROLE", "ALL");

    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocAclResolver aclResolver;
    private final DocKnowledgeService knowledge;
    private final DocContentValidation validation;

    public List<AckTarget> targets(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        Long revisionId = head.getEffectiveRevisionId();
        return revisionId == null ? List.of() : targets(nodeId, revisionId);
    }

    @Transactional
    public List<AckTarget> saveTargets(long nodeId, AckTargetSave input) {
        access.human();
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        access.live(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        validation.validate(input);
        Long revisionId = effectiveRevision(head);
        List<AckTargetInput> normalized = normalize(head.getConfidentiality(), input.targets());
        store.jdbc().update("DELETE FROM doc_ack_target WHERE node_id=? AND revision_id=?", nodeId, revisionId);
        long actor = access.actor();
        for (AckTargetInput target : normalized) {
            store.jdbc().update("INSERT INTO doc_ack_target(node_id,revision_id,subject_type,subject_id,due_at,created_by) "
                            + "VALUES(?,?,?,?,?,?)",
                    nodeId, revisionId, target.subjectType(), target.subjectId(), target.dueAt(), actor);
        }
        store.audit(nodeId, head.getSpaceId(), actor, "ACK_TARGET_CHANGE", revisionId,
                "targets=" + normalized.size(), null);
        return targets(nodeId, revisionId);
    }

    public AckStatus status(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        Long revisionId = effectiveRevision(head);
        return status(nodeId, revisionId);
    }

    @Transactional
    public AckStatus ack(long nodeId, String sourceIp, String userAgent) {
        access.human();
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        Long revisionId = effectiveRevision(head);
        long targetCount = targetCount(nodeId, revisionId);
        if (targetCount == 0) throw new BusinessException(409, "此文檔尚未設定簽收範圍");
        long actor = access.actor();
        if (!matchesTarget(nodeId, revisionId, actor)) {
            throw new BusinessException(403, "您不在此文檔的簽收範圍內");
        }
        if (receiptAt(nodeId, revisionId, actor) == null) {
            store.jdbc().update("INSERT IGNORE INTO doc_ack_receipt(node_id,revision_id,user_id,source_ip,user_agent) "
                            + "VALUES(?,?,?,?,?)",
                    nodeId, revisionId, actor, truncate(sourceIp, 64), truncate(userAgent, 255));
            store.audit(nodeId, head.getSpaceId(), actor, "ACK", revisionId,
                    "ip=" + truncate(sourceIp, 64), null);
        }
        return status(nodeId, revisionId);
    }

    public List<AckReceipt> receipts(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        Long revisionId = effectiveRevision(head);
        return store.jdbc().query("SELECT r.user_id,u.name,u.emp_id,r.acknowledged_at FROM doc_ack_receipt r "
                        + "JOIN sys_user u ON u.id=r.user_id WHERE r.node_id=? AND r.revision_id=? "
                        + "ORDER BY r.acknowledged_at DESC LIMIT 500",
                (rs, i) -> new AckReceipt(rs.getLong("user_id"), rs.getString("name"), rs.getString("emp_id"),
                        rs.getTimestamp("acknowledged_at").toLocalDateTime()),
                nodeId, revisionId);
    }

    /** 按签收范围聚合覆盖人数；只对当前生效版本、且仅负责人/空间管理可看。 */
    public AckCoverage coverage(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        Long revisionId = effectiveRevision(head);
        String from = coverageFrom();
        List<AckCoverageRow> rows = store.jdbc().query(
                "SELECT t.subject_type,t.subject_id,MAX(COALESCE(dept.name,sr.name,'全部')) AS subject_name,"
                        + "t.due_at,COUNT(DISTINCT u.id) AS target_users,COUNT(DISTINCT rr.user_id) AS acked_users "
                        + from + " GROUP BY t.subject_type,t.subject_id,t.due_at"
                        + " ORDER BY t.subject_type,t.subject_id",
                (rs, i) -> {
                    long target = rs.getLong("target_users");
                    long acked = rs.getLong("acked_users");
                    return new AckCoverageRow(rs.getString("subject_type"), rs.getString("subject_id"),
                            rs.getString("subject_name"), rs.getDate("due_at") == null ? null
                                    : rs.getDate("due_at").toLocalDate(), target, acked, rate(target, acked));
                }, nodeId, revisionId);
        Map<String, Object> totals = store.jdbc().queryForMap(
                "SELECT COUNT(DISTINCT u.id) AS target_users,COUNT(DISTINCT rr.user_id) AS acked_users " + from,
                nodeId, revisionId);
        long target = ((Number) totals.get("target_users")).longValue();
        long acked = ((Number) totals.get("acked_users")).longValue();
        return new AckCoverage(rows, target, acked, rate(target, acked));
    }

    /** 导出当前生效版本的全部回执；CSV 由调用方加 UTF-8 BOM。 */
    @Transactional
    public AckExport exportReceipts(long nodeId) {
        access.human();
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        Long revisionId = effectiveRevision(head);
        List<Map<String, Object>> rows = store.jdbc().queryForList(
                "SELECT u.name,u.emp_id,r.acknowledged_at,r.source_ip,r.user_agent "
                        + "FROM doc_ack_receipt r JOIN sys_user u ON u.id=r.user_id "
                        + "WHERE r.node_id=? AND r.revision_id=? ORDER BY r.acknowledged_at,r.user_id",
                nodeId, revisionId);
        StringBuilder csv = new StringBuilder("姓名,工号,签收时间,来源IP,User-Agent\n");
        for (Map<String, Object> row : rows) {
            Object acknowledgedAt = row.get("acknowledged_at");
            csv.append(csvCell(row.get("name"))).append(',')
                    .append(csvCell(row.get("emp_id"))).append(',')
                    .append(csvCell(acknowledgedAt instanceof Timestamp ts
                            ? ts.toLocalDateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                            : acknowledgedAt)).append(',')
                    .append(csvCell(row.get("source_ip"))).append(',')
                    .append(csvCell(row.get("user_agent"))).append('\n');
        }
        store.audit(nodeId, head.getSpaceId(), access.actor(), "ACK_EXPORT", revisionId,
                "rows=" + rows.size(), null);
        String no = head.getDocumentNo() == null ? "doc-" + nodeId : head.getDocumentNo();
        return new AckExport(csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                no + "-ack-receipts.csv");
    }

    private String coverageFrom() {
        return " FROM doc_ack_target t "
                + "LEFT JOIN sys_department dept ON t.subject_type='DEPT' AND dept.id=CAST(t.subject_id AS UNSIGNED) "
                + "LEFT JOIN sys_role sr ON t.subject_type='ROLE' AND sr.id=CAST(t.subject_id AS UNSIGNED) "
                + "LEFT JOIN sys_user u ON u.status=1 AND (t.subject_type='ALL' "
                + "OR (t.subject_type='DEPT' AND u.department_id=CAST(t.subject_id AS UNSIGNED)) "
                + "OR (t.subject_type='ROLE' AND ("
                + "(u.function_roles IS NOT NULL AND CASE WHEN JSON_VALID(u.function_roles) "
                + "THEN (JSON_CONTAINS(u.function_roles,CAST(t.subject_id AS JSON)) "
                + "OR JSON_CONTAINS(u.function_roles,JSON_QUOTE(t.subject_id))) ELSE 0 END=1) "
                + "OR (u.role IS NOT NULL AND EXISTS(SELECT 1 FROM sys_role sr2 "
                + "WHERE sr2.id=CAST(t.subject_id AS UNSIGNED) AND sr2.status=1 AND sr2.code=u.role))"
                + "))) "
                + "LEFT JOIN doc_ack_receipt rr ON rr.node_id=t.node_id AND rr.revision_id=t.revision_id "
                + "AND rr.user_id=u.id WHERE t.node_id=? AND t.revision_id=?";
    }

    private static double rate(long target, long acked) {
        if (target <= 0) return 0;
        return Math.round(acked * 10000.0 / target) / 100.0;
    }

    private static String csvCell(Object value) {
        if (value == null) return "\"\"";
        String text = String.valueOf(value);
        if (!text.isEmpty() && "=+-@".indexOf(text.charAt(0)) >= 0) text = "'" + text;
        return '"' + text.replace("\"", "\"\"") + '"';
    }

    public PendingAckPage pending(int page, int size) {
        access.documentMenu("view");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        long actor = access.actor();
        var subjects = aclResolver.subjects(actor);
        DocKnowledgeService.Filter filter = knowledge.filter(null, null, null, null, null, null);
        MapSqlParameterSource params = filter.params()
                .addValue("ackDept", subjects.deptId() == null ? "-1" : String.valueOf(subjects.deptId()))
                .addValue("ackRoles", subjects.roleIds().isEmpty()
                        ? List.of("-1") : subjects.roleIds().stream().map(String::valueOf).toList());
        String subjectCondition = " AND r.user_id IS NULL"
                + " AND (t.subject_type='ALL'"
                + " OR (t.subject_type='DEPT' AND t.subject_id=:ackDept)"
                + " OR (t.subject_type='ROLE' AND t.subject_id IN (:ackRoles)))";
        String from = " FROM doc_ack_target t"
                + " JOIN doc_native_document d ON d.node_id=t.node_id AND t.revision_id=d.effective_revision_id"
                + " JOIN doc_search_index i ON i.node_id=d.node_id"
                + " JOIN doc_space s ON s.id=i.space_id"
                + " LEFT JOIN doc_ack_receipt r ON r.node_id=t.node_id AND r.revision_id=t.revision_id AND r.user_id=:actor"
                + filter.where() + subjectCondition;
        var jdbc = new NamedParameterJdbcTemplate(store.jdbc());
        Long total = jdbc.queryForObject("SELECT COUNT(DISTINCT i.node_id)" + from, params, Long.class);
        params.addValue("limit", safeSize).addValue("offset", (safePage - 1) * safeSize);
        List<PendingAck> rows = jdbc.query("SELECT i.node_id,i.title,s.name AS space_name,d.effective_revision_id,"
                        + "MIN(t.due_at) AS due_at,i.confidentiality,i.updated_at" + from
                        + " GROUP BY i.node_id,i.title,s.name,d.effective_revision_id,i.confidentiality,i.updated_at"
                        + " ORDER BY MIN(t.due_at) IS NULL,MIN(t.due_at),i.updated_at DESC LIMIT :limit OFFSET :offset",
                params,
                (rs, i) -> new PendingAck(rs.getLong("node_id"), rs.getString("title"), rs.getString("space_name"),
                        rs.getLong("effective_revision_id"),
                        rs.getDate("due_at") == null ? null : rs.getDate("due_at").toLocalDate(),
                        rs.getInt("confidentiality"), rs.getTimestamp("updated_at").toLocalDateTime()));
        return new PendingAckPage(rows, total == null ? 0 : total, safePage, safeSize);
    }

    private AckStatus status(long nodeId, Long revisionId) {
        long targetCount = targetCount(nodeId, revisionId);
        long receiptCount = receiptCount(nodeId, revisionId);
        long actor = access.actor();
        LocalDateTime acknowledgedAt = receiptAt(nodeId, revisionId, actor);
        LocalDate dueAt = dueAt(nodeId, revisionId);
        boolean targeted = targetCount > 0 && matchesTarget(nodeId, revisionId, actor);
        return new AckStatus(nodeId, revisionId, targeted, acknowledgedAt != null,
                acknowledgedAt, dueAt, targetCount, receiptCount);
    }

    private List<AckTarget> targets(long nodeId, long revisionId) {
        return store.jdbc().query("SELECT t.subject_type,t.subject_id,t.due_at,"
                        + "COALESCE(dept.name,r.name,'全部') AS subject_name "
                        + "FROM doc_ack_target t "
                        + "LEFT JOIN sys_department dept ON t.subject_type='DEPT' AND dept.id=CAST(t.subject_id AS UNSIGNED) "
                        + "LEFT JOIN sys_role r ON t.subject_type='ROLE' AND r.id=CAST(t.subject_id AS UNSIGNED) "
                        + "WHERE t.node_id=? AND t.revision_id=? ORDER BY t.subject_type,t.subject_id",
                (rs, i) -> new AckTarget(rs.getString("subject_type"), rs.getString("subject_id"),
                        rs.getString("subject_name"),
                        rs.getDate("due_at") == null ? null : rs.getDate("due_at").toLocalDate()),
                nodeId, revisionId);
    }

    private List<AckTargetInput> normalize(int confidentiality, List<AckTargetInput> targets) {
        if (targets == null) throw new BusinessException(400, "簽收範圍不能為空");
        List<AckTargetInput> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (AckTargetInput raw : targets) {
            String type = raw.subjectType() == null ? "" : raw.subjectType().trim().toUpperCase();
            if (!SUBJECT_TYPES.contains(type)) throw new BusinessException(400, "不支援的簽收主體");
            if ("ALL".equals(type) && confidentiality >= DocAclResolver.SENSITIVE) {
                throw new BusinessException(400, "敏感/機密文檔不能要求全員簽收");
            }
            if (!"ALL".equals(type) && (raw.subjectId() == null || raw.subjectId().isBlank())) {
                throw new BusinessException(400, "簽收主體不能為空");
            }
            String subjectId = "ALL".equals(type) ? "0" : raw.subjectId().trim();
            if (!"ALL".equals(type)) {
                if (!subjectId.matches("\\d{1,19}")) throw new BusinessException(400, "簽收主體 ID 格式不正確");
                String table = "DEPT".equals(type) ? "sys_department" : "sys_role";
                if (store.count("SELECT COUNT(*) FROM " + table + " WHERE id=?", Long.parseLong(subjectId)) == 0) {
                    throw new BusinessException(400, "簽收主體不存在");
                }
            }
            if (!seen.add(type + ":" + subjectId)) throw new BusinessException(400, "簽收主體重複");
            if (raw.dueAt() != null && raw.dueAt().isBefore(LocalDate.now())) {
                throw new BusinessException(400, "簽收截止日不能早於今天");
            }
            result.add(new AckTargetInput(type, subjectId, raw.dueAt()));
        }
        return result;
    }

    private boolean matchesTarget(long nodeId, long revisionId, long actor) {
        List<Map<String, Object>> rows = store.jdbc().queryForList(
                "SELECT subject_type,subject_id FROM doc_ack_target WHERE node_id=? AND revision_id=?",
                nodeId, revisionId);
        if (rows.isEmpty()) return false;
        var subjects = aclResolver.subjects(actor);
        for (Map<String, Object> row : rows) {
            String type = String.valueOf(row.get("subject_type"));
            String subjectId = String.valueOf(row.get("subject_id"));
            if ("ALL".equals(type)) return true;
            if ("DEPT".equals(type) && subjects.deptId() != null
                    && subjectId.equals(String.valueOf(subjects.deptId()))) return true;
            if ("ROLE".equals(type) && subjects.roleIds().stream()
                    .anyMatch(id -> subjectId.equals(String.valueOf(id)))) return true;
        }
        return false;
    }

    private long targetCount(long nodeId, Long revisionId) {
        if (revisionId == null) return 0;
        return store.count("SELECT COUNT(*) FROM doc_ack_target WHERE node_id=? AND revision_id=?", nodeId, revisionId);
    }

    private long receiptCount(long nodeId, Long revisionId) {
        if (revisionId == null) return 0;
        return store.count("SELECT COUNT(*) FROM doc_ack_receipt WHERE node_id=? AND revision_id=?", nodeId, revisionId);
    }

    private LocalDateTime receiptAt(long nodeId, Long revisionId, long userId) {
        if (revisionId == null) return null;
        List<Timestamp> rows = store.jdbc().queryForList(
                "SELECT acknowledged_at FROM doc_ack_receipt WHERE node_id=? AND revision_id=? AND user_id=?",
                Timestamp.class, nodeId, revisionId, userId);
        return rows.isEmpty() ? null : rows.get(0).toLocalDateTime();
    }

    private LocalDate dueAt(long nodeId, Long revisionId) {
        if (revisionId == null) return null;
        java.sql.Date value = store.jdbc().queryForObject(
                "SELECT MIN(due_at) FROM doc_ack_target WHERE node_id=? AND revision_id=?", java.sql.Date.class,
                nodeId, revisionId);
        return value == null ? null : value.toLocalDate();
    }

    private Long effectiveRevision(Head head) {
        if (head.getEffectiveRevisionId() == null) throw new BusinessException(409, "此文檔尚無生效版本");
        return head.getEffectiveRevisionId();
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        String trimmed = value.replaceAll("[\\p{Cntrl}]", "").trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }
}

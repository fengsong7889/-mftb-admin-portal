package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.dto.DocNativeDTO.Head;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * P1d 档案与销毁：归档只读、保管期限、冻结、申请人≠审批人。
 *
 * <p>销毁是最危险的写操作：必须 MANAGE、非冻结、申请人≠审批人；通过后清空正文与资产绑定，
 * 保留 node/revision 的标题、摘要、哈希与销毁证书号，供审计追溯。
 */
@Service
@RequiredArgsConstructor
public class DocArchiveService {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DocNativeStore store;
    private final DocNativeAccess access;

    @Transactional
    public ArchiveMeta archive(long nodeId, ArchiveSave input) {
        access.human();
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        requireManager(head);
        if (head.getStatus() == 7) throw new BusinessException(409, "已銷毀文檔不能歸檔");
        String archiveNo = "AR-" + input.retentionStart().getYear() + "-" + nodeId;
        store.jdbc().update("INSERT INTO doc_archive_meta(node_id,archive_no,fonds_code,security_level,"
                        + "retention_years,retention_start,disposal_state,legal_hold,archived_by) "
                        + "VALUES(?,?,?,?,?,?,0,?,?) ON DUPLICATE KEY UPDATE archive_no=VALUES(archive_no),"
                        + "retention_years=VALUES(retention_years),retention_start=VALUES(retention_start),"
                        + "legal_hold=VALUES(legal_hold),archived_at=NOW(),archived_by=VALUES(archived_by)",
                nodeId, archiveNo, String.valueOf(head.getSpaceId()), head.getConfidentiality(),
                input.retentionYears(), input.retentionStart(), input.legalHold() ? 1 : 0, access.actor());
        store.jdbc().update("UPDATE doc_node SET status=4 WHERE id=?", nodeId);
        store.jdbc().update("UPDATE doc_native_document SET lifecycle=2 WHERE node_id=?", nodeId);
        store.audit(nodeId, head.getSpaceId(), access.actor(), "ARCHIVE", head.getEffectiveRevisionId(),
                "retentionYears=" + input.retentionYears() + ",legalHold=" + input.legalHold(), null);
        return meta(nodeId);
    }

    public List<ArchiveMeta> archives(String keyword, int page, int size) {
        access.documentMenu("edit");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        String like = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        return store.jdbc().query("SELECT a.node_id,d.document_no,n.title,s.name AS space_name,a.archive_no,"
                        + "a.fonds_code,a.series_code,a.security_level,a.retention_years,a.retention_start,"
                        + "a.disposal_state,a.legal_hold,a.archived_at FROM doc_archive_meta a "
                        + "JOIN doc_native_document d ON d.node_id=a.node_id JOIN doc_node n ON n.id=a.node_id "
                        + "JOIN doc_space s ON s.id=d.space_id WHERE (? IS NULL OR n.title LIKE ? OR d.document_no LIKE ?) "
                        + "ORDER BY a.archived_at DESC LIMIT ? OFFSET ?",
                (rs, i) -> new ArchiveMeta(rs.getLong("node_id"), rs.getString("document_no"),
                        rs.getString("title"), rs.getString("space_name"), rs.getString("archive_no"),
                        rs.getString("fonds_code"), rs.getString("series_code"), rs.getInt("security_level"),
                        rs.getInt("retention_years"), rs.getDate("retention_start").toLocalDate(),
                        rs.getInt("disposal_state"), rs.getInt("legal_hold") == 1,
                        rs.getTimestamp("archived_at").toLocalDateTime()),
                like, like, like, safeSize, (safePage - 1) * safeSize);
    }

    @Transactional
    public DisposalRequest requestDisposal(long nodeId, DisposalSave input) {
        access.human();
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        requireManager(head);
        ArchiveMeta meta = meta(nodeId);
        if (meta.legalHold()) throw new BusinessException(409, "檔案已凍結，不能銷毀");
        if (store.count("SELECT COUNT(*) FROM doc_disposal_request WHERE node_id=? AND status IN (1,2)", nodeId) > 0) {
            throw new BusinessException(409, "此檔案已有待審批或已批准的銷毀申請");
        }
        store.jdbc().update("INSERT INTO doc_disposal_request(node_id,reason,requested_by) VALUES(?,?,?)",
                nodeId, input.reason().trim(), access.actor());
        store.jdbc().update("UPDATE doc_archive_meta SET disposal_state=1 WHERE node_id=?", nodeId);
        store.jdbc().update("UPDATE doc_node SET status=6 WHERE id=?", nodeId);
        store.audit(nodeId, head.getSpaceId(), access.actor(), "DISPOSAL_REQUEST",
                head.getEffectiveRevisionId(), input.reason().trim(), null);
        Long id = store.jdbc().queryForObject("SELECT id FROM doc_disposal_request WHERE node_id=? "
                + "ORDER BY id DESC LIMIT 1", Long.class, nodeId);
        return request(id);
    }

    public List<DisposalRequest> requests(Integer status, int page, int size) {
        access.documentMenu("edit");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        return store.jdbc().query("SELECT r.id,r.node_id,d.document_no,n.title,r.reason,r.requested_by,"
                        + "u.name AS requested_name,r.approved_by,a.name AS approved_name,r.status,"
                        + "r.certificate_no,r.created_at,r.decided_at,r.destroyed_at "
                        + "FROM doc_disposal_request r JOIN doc_native_document d ON d.node_id=r.node_id "
                        + "JOIN doc_node n ON n.id=r.node_id JOIN sys_user u ON u.id=r.requested_by "
                        + "LEFT JOIN sys_user a ON a.id=r.approved_by WHERE (?=0 OR r.status=?) "
                        + "ORDER BY r.created_at DESC LIMIT ? OFFSET ?",
                (rs, i) -> request(rs), status == null ? 0 : status, status == null ? 0 : status,
                safeSize, (safePage - 1) * safeSize);
    }

    @Transactional
    public DisposalRequest decide(long id, DisposalDecision input) {
        access.human();
        DisposalRequest request = request(id);
        Head head = store.head(request.nodeId(), true);
        access.editDocumentCompat(head);
        requireManager(head);
        if (request.status() != 1) throw new BusinessException(409, "銷毀申請已處理");
        if (request.requestedBy().equals(access.actor())) {
            throw new BusinessException(409, "申請人不能審批自己的銷毀申請");
        }
        if (input.approve()) {
            ArchiveMeta meta = meta(request.nodeId());
            if (meta.legalHold()) throw new BusinessException(409, "檔案已凍結，不能銷毀");
            String certificate = StringUtils.hasText(input.certificateNo()) ? input.certificateNo().trim()
                    : "DC-" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + id;
            store.jdbc().update("UPDATE doc_disposal_request SET status=4,approved_by=?,certificate_no=?,"
                    + "decided_at=NOW(),destroyed_at=NOW() WHERE id=?", access.actor(), certificate, id);
            store.jdbc().update("UPDATE doc_archive_meta SET disposal_state=3 WHERE node_id=?", request.nodeId());
            store.jdbc().update("UPDATE doc_node SET status=7 WHERE id=?", request.nodeId());
            store.jdbc().update("UPDATE doc_native_document SET lifecycle=3 WHERE node_id=?", request.nodeId());
            store.jdbc().update("UPDATE doc_revision SET markdown='' WHERE node_id=?", request.nodeId());
            store.jdbc().update("UPDATE doc_search_index SET body_text='',status=7 WHERE node_id=?", request.nodeId());
            List<Long> assetIds = store.jdbc().queryForList(
                    "SELECT asset_id FROM doc_revision_asset WHERE revision_id IN "
                            + "(SELECT id FROM doc_revision WHERE node_id=?)", Long.class, request.nodeId());
            store.jdbc().update("DELETE FROM doc_revision_asset WHERE revision_id IN "
                    + "(SELECT id FROM doc_revision WHERE node_id=?)", request.nodeId());
            for (Long assetId : assetIds) store.jdbc().update("DELETE FROM doc_asset WHERE id=?", assetId);
            store.audit(request.nodeId(), head.getSpaceId(), access.actor(), "DISPOSAL_DESTROY",
                    head.getEffectiveRevisionId(), "certificate=" + certificate, null);
        } else {
            store.jdbc().update("UPDATE doc_disposal_request SET status=3,approved_by=?,decided_at=NOW() WHERE id=?",
                    access.actor(), id);
            store.jdbc().update("UPDATE doc_archive_meta SET disposal_state=0 WHERE node_id=?", request.nodeId());
            store.jdbc().update("UPDATE doc_node SET status=4 WHERE id=?", request.nodeId());
            store.audit(request.nodeId(), head.getSpaceId(), access.actor(), "DISPOSAL_REJECT",
                    head.getEffectiveRevisionId(), "request=" + id, null);
        }
        return request(id);
    }

    public byte[] exportDisposalCsv() {
        access.documentMenu("edit");
        List<DisposalRequest> rows = requests(null, 1, 100000);
        StringBuilder csv = new StringBuilder("申请ID,文档编号,标题,原因,申请人,状态,审批人,证书号,申请时间,决定时间\n");
        for (DisposalRequest row : rows) {
            csv.append(row.id()).append(',').append(cell(row.documentNo())).append(',')
                    .append(cell(row.title())).append(',').append(cell(row.reason())).append(',')
                    .append(cell(row.requestedByName())).append(',').append(row.status()).append(',')
                    .append(cell(row.approvedByName())).append(',').append(cell(row.certificateNo())).append(',')
                    .append(row.createdAt() == null ? "" : row.createdAt().format(DATE)).append(',')
                    .append(row.decidedAt() == null ? "" : row.decidedAt().format(DATE)).append('\n');
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    private ArchiveMeta meta(long nodeId) {
        List<ArchiveMeta> rows = store.jdbc().query(
                "SELECT a.node_id,d.document_no,n.title,s.name AS space_name,a.archive_no,a.fonds_code,"
                        + "a.series_code,a.security_level,a.retention_years,a.retention_start,a.disposal_state,"
                        + "a.legal_hold,a.archived_at FROM doc_archive_meta a "
                        + "JOIN doc_native_document d ON d.node_id=a.node_id JOIN doc_node n ON n.id=a.node_id "
                        + "JOIN doc_space s ON s.id=d.space_id WHERE a.node_id=?",
                (rs, i) -> new ArchiveMeta(rs.getLong("node_id"), rs.getString("document_no"),
                        rs.getString("title"), rs.getString("space_name"), rs.getString("archive_no"),
                        rs.getString("fonds_code"), rs.getString("series_code"), rs.getInt("security_level"),
                        rs.getInt("retention_years"), rs.getDate("retention_start").toLocalDate(),
                        rs.getInt("disposal_state"), rs.getInt("legal_hold") == 1,
                        rs.getTimestamp("archived_at").toLocalDateTime()), nodeId);
        if (rows.isEmpty()) throw new BusinessException(404, "檔案不存在，請先歸檔");
        return rows.get(0);
    }

    private DisposalRequest request(long id) {
        List<DisposalRequest> rows = store.jdbc().query(
                "SELECT r.id,r.node_id,d.document_no,n.title,r.reason,r.requested_by,u.name AS requested_name,"
                        + "r.approved_by,a.name AS approved_name,r.status,r.certificate_no,r.created_at,"
                        + "r.decided_at,r.destroyed_at FROM doc_disposal_request r "
                        + "JOIN doc_native_document d ON d.node_id=r.node_id JOIN doc_node n ON n.id=r.node_id "
                        + "JOIN sys_user u ON u.id=r.requested_by LEFT JOIN sys_user a ON a.id=r.approved_by "
                        + "WHERE r.id=?", (rs, i) -> request(rs), id);
        if (rows.isEmpty()) throw new BusinessException(404, "銷毀申請不存在");
        return rows.get(0);
    }

    private static DisposalRequest request(java.sql.ResultSet rs) throws java.sql.SQLException {
        Long approvedBy = (Long) rs.getObject("approved_by");
        return new DisposalRequest(rs.getLong("id"), rs.getLong("node_id"), rs.getString("document_no"),
                rs.getString("title"), rs.getString("reason"), rs.getLong("requested_by"),
                rs.getString("requested_name"), approvedBy, rs.getString("approved_name"), rs.getInt("status"),
                rs.getString("certificate_no"), rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("decided_at") == null ? null : rs.getTimestamp("decided_at").toLocalDateTime(),
                rs.getTimestamp("destroyed_at") == null ? null : rs.getTimestamp("destroyed_at").toLocalDateTime());
    }

    private void requireManager(Head head) {
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
    }

    private static String cell(String value) {
        String text = value == null ? "" : value;
        if (!text.isEmpty() && "=+-@".indexOf(text.charAt(0)) >= 0) text = "'" + text;
        return '"' + text.replace("\"", "\"\"") + '"';
    }
}

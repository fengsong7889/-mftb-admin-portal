package com.mftb.admin.service.doc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.DocNativeDTO.Head;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 文档授权解析：空间位集由调用方校验，本类只回答“这个人在文档维度能不能读/改/下载”。
 *
 * <p>规则：
 * <ul>
 *   <li>PUBLIC/INTERNAL：空间读即可；restricted=1 时再收窄到负责人或 ACL。</li>
 *   <li>SENSITIVE/RESTRICTED：必须 ACL 命中且用户密级足够；ALL 主体只对 PUBLIC/INTERNAL 生效。</li>
 *   <li>旧表 doc_document_acl 与新表 doc_acl_entry 取并集，保证 v2 存量授权不失效。</li>
 *   <li>ACL 只能收窄空间权限，不能把没有空间读权限的人放进来。</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class DocAclResolver {
    public static final int PUBLIC = 1, INTERNAL = 2, SENSITIVE = 3, RESTRICTED = 4;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final DocNativeStore store;

    public int clearance(long userId) {
        List<Integer> rows = store.jdbc().queryForList(
                "SELECT max_level FROM doc_user_clearance WHERE user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)",
                Integer.class, userId);
        return rows.isEmpty() ? INTERNAL : rows.get(0);
    }

    public boolean canRead(Head head, long userId) {
        // 负责人/创建人始终能读自己建立的文档：他们本来就持有原文，密级用于约束其他读者。
        if (isOwner(head, userId)) return true;
        if (head.getConfidentiality() >= SENSITIVE && clearance(userId) < head.getConfidentiality()) return false;
        boolean narrowed = head.isRestricted() || head.getConfidentiality() >= SENSITIVE;
        if (!narrowed) return true;
        return legacyAcl(head.getNodeId(), userId, DocNativeAccess.READ)
                || acl(head.getNodeId(), userId, DocNativeAccess.READ, head.getConfidentiality());
    }

    public boolean canEdit(Head head, long userId) {
        if (!canRead(head, userId)) return false;
        if (isOwner(head, userId)) return true;
        return legacyAcl(head.getNodeId(), userId, DocNativeAccess.EDIT)
                || acl(head.getNodeId(), userId, DocNativeAccess.EDIT, head.getConfidentiality());
    }

    /**
     * P0 下载口径：策略 1 允许；策略 2/3 暂不做审批流，直接拒绝；
     * RESTRICTED 一律拒绝下载，避免在审批与水印落地前放出明文。
     */
    public boolean canDownload(Head head, long userId) {
        if (!canRead(head, userId)) return false;
        if (head.getDownloadPolicy() != 1) return false;
        return head.getConfidentiality() < RESTRICTED;
    }

    public AclSubjects subjects(long userId) {
        List<Map<String, Object>> rows = store.jdbc().queryForList(
                "SELECT department_id,function_roles,role FROM sys_user WHERE id=?", userId);
        if (rows.isEmpty()) return new AclSubjects(userId, null, List.of());
        Map<String, Object> row = rows.get(0);
        Long deptId = row.get("department_id") == null ? null : ((Number) row.get("department_id")).longValue();
        Set<Long> roleIds = new LinkedHashSet<>(parseRoles(row.get("function_roles")));
        Object role = row.get("role");
        if (role != null && !String.valueOf(role).isBlank()) {
            List<Long> byCode = store.jdbc().queryForList(
                    "SELECT id FROM sys_role WHERE code=? AND status=1", Long.class, String.valueOf(role));
            roleIds.addAll(byCode);
        }
        return new AclSubjects(userId, deptId, new ArrayList<>(roleIds));
    }

    private boolean acl(long nodeId, long userId, int bit, int confidentiality) {
        AclSubjects subjects = subjects(userId);
        if (match(nodeId, "USER", String.valueOf(userId), bit)) return true;
        if (subjects.deptId() != null && match(nodeId, "DEPT", String.valueOf(subjects.deptId()), bit)) return true;
        for (Long roleId : subjects.roleIds()) {
            if (match(nodeId, "ROLE", String.valueOf(roleId), bit)) return true;
        }
        return confidentiality <= INTERNAL && match(nodeId, "ALL", "0", bit);
    }

    private boolean match(long nodeId, String subjectType, String subjectId, int bit) {
        return store.count("SELECT COUNT(*) FROM doc_acl_entry WHERE node_id=? AND subject_type=? AND subject_id=? "
                        + "AND (permissions & ?)<>0 AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)",
                nodeId, subjectType, subjectId, bit) > 0;
    }

    private boolean legacyAcl(long nodeId, long userId, int bit) {
        return store.count("SELECT COUNT(*) FROM doc_document_acl WHERE node_id=? AND user_id=? AND (permissions & ?)<>0",
                nodeId, userId, bit) > 0;
    }

    private boolean isOwner(Head head, long userId) {
        return head.getOwnerUserId() != null && head.getOwnerUserId() == userId
                || head.getCreatedByUserId() != null && head.getCreatedByUserId() == userId;
    }

    private static List<Long> parseRoles(Object value) {
        if (value == null || String.valueOf(value).isBlank()) return List.of();
        try {
            return JSON.readValue(String.valueOf(value), JSON.getTypeFactory().constructCollectionType(List.class, Long.class));
        } catch (Exception ignored) {
            List<Long> ids = new ArrayList<>();
            var matcher = java.util.regex.Pattern.compile("\\d+").matcher(String.valueOf(value));
            while (matcher.find()) ids.add(Long.parseLong(matcher.group()));
            return ids;
        }
    }

    public record AclSubjects(long userId, Long deptId, List<Long> roleIds) {}
}

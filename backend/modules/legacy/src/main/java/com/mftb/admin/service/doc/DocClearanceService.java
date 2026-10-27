package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.Clearance;
import com.mftb.admin.dto.DocKnowledgeDTO.ClearanceSave;
import com.mftb.admin.dto.DocKnowledgeDTO.ClearanceUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static com.mftb.admin.service.doc.DocAclResolver.INTERNAL;

/**
 * 用户密级授权：全局主体属性，控制 SENSITIVE/RESTRICTED 文档的非负责人访问。
 *
 * <p>只有 doc-space:edit 能操作；每次授予/调整/撤销都写 doc_clearance_audit。
 * 撤销表示回落到默认 INTERNAL(2)，不是删除历史审计。
 */
@Service
@RequiredArgsConstructor
public class DocClearanceService {
    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocContentValidation validation;

    /** 搜索可授权的登录账号（包含没有 HR 员工档案的内置 admin）。 */
    public List<ClearanceUser> searchUsers(String keyword) {
        access.human();
        access.menu("doc-space", "edit");
        if (keyword != null && keyword.length() > 100) throw new BusinessException(400, "關鍵字過長");
        String like = keyword == null || keyword.isBlank() ? null : "%" + keyword.trim() + "%";
        return store.jdbc().query("SELECT id,name,emp_id,username FROM sys_user WHERE status=1 "
                        + "AND (? IS NULL OR name LIKE ? OR emp_id LIKE ? OR username LIKE ?) "
                        + "ORDER BY name,id LIMIT 30",
                (rs, i) -> new ClearanceUser(rs.getLong("id"), rs.getString("name"),
                        rs.getString("emp_id"), rs.getString("username")),
                like, like, like, like);
    }

    public List<Clearance> list(String keyword) {
        access.human();
        access.menu("doc-space", "edit");
        String like = keyword == null || keyword.isBlank() ? null : "%" + keyword.trim() + "%";
        if (like != null && keyword.length() > 100) throw new BusinessException(400, "關鍵字過長");
        return store.jdbc().query("SELECT c.user_id,u.name,u.emp_id,c.max_level,c.granted_at,c.expires_at,"
                        + "g.name AS granted_by_name FROM doc_user_clearance c "
                        + "JOIN sys_user u ON u.id=c.user_id LEFT JOIN sys_user g ON g.id=c.granted_by "
                        + "WHERE (? IS NULL OR u.name LIKE ? OR u.emp_id LIKE ?) "
                        + "ORDER BY c.max_level DESC,c.user_id",
                (rs, i) -> new Clearance(rs.getLong("user_id"), rs.getString("name"), rs.getString("emp_id"),
                        rs.getInt("max_level"), rs.getString("granted_by_name"),
                        rs.getTimestamp("granted_at") == null ? null : rs.getTimestamp("granted_at").toLocalDateTime(),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toLocalDateTime()),
                like, like, like);
    }

    @Transactional
    public Clearance save(long userId, ClearanceSave input) {
        access.human();
        access.menu("doc-space", "edit");
        validation.validate(input);
        requireActiveUser(userId);
        int oldLevel = currentLevel(userId);
        LocalDateTime expiresAt = input.days() == null ? null : LocalDateTime.now().plusDays(input.days());
        store.jdbc().update("INSERT INTO doc_user_clearance(user_id,max_level,granted_by,granted_at,expires_at) "
                        + "VALUES(?,?,?,CURRENT_TIMESTAMP,?) ON DUPLICATE KEY UPDATE max_level=VALUES(max_level),"
                        + "granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP,expires_at=VALUES(expires_at)",
                userId, input.maxLevel(), access.actor(), expiresAt);
        audit(userId, oldLevel, input.maxLevel(), expiresAt);
        return one(userId);
    }

    @Transactional
    public void revoke(long userId) {
        access.human();
        access.menu("doc-space", "edit");
        requireActiveUser(userId);
        int oldLevel = currentLevel(userId);
        store.jdbc().update("DELETE FROM doc_user_clearance WHERE user_id=?", userId);
        audit(userId, oldLevel, INTERNAL, null);
    }

    /** 当前生效密级；无记录或已过期均回落 INTERNAL。 */
    public int currentLevel(long userId) {
        List<Integer> rows = store.jdbc().queryForList(
                "SELECT max_level FROM doc_user_clearance WHERE user_id=? "
                        + "AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)", Integer.class, userId);
        return rows.isEmpty() ? INTERNAL : rows.get(0);
    }

    private Clearance one(long userId) {
        List<Clearance> rows = store.jdbc().query("SELECT c.user_id,u.name,u.emp_id,c.max_level,c.granted_at,c.expires_at,"
                        + "g.name AS granted_by_name FROM doc_user_clearance c "
                        + "JOIN sys_user u ON u.id=c.user_id LEFT JOIN sys_user g ON g.id=c.granted_by WHERE c.user_id=?",
                (rs, i) -> new Clearance(rs.getLong("user_id"), rs.getString("name"), rs.getString("emp_id"),
                        rs.getInt("max_level"), rs.getString("granted_by_name"),
                        rs.getTimestamp("granted_at") == null ? null : rs.getTimestamp("granted_at").toLocalDateTime(),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toLocalDateTime()),
                userId);
        if (rows.isEmpty()) throw new IllegalStateException("密級授權寫入後未能回讀");
        return rows.get(0);
    }

    private void audit(long userId, int oldLevel, int newLevel, LocalDateTime expiresAt) {
        store.jdbc().update("INSERT INTO doc_clearance_audit(user_id,old_level,new_level,granted_by,expires_at) "
                + "VALUES(?,?,?,?,?)", userId, oldLevel, newLevel, access.actor(), expiresAt);
    }

    private void requireActiveUser(long userId) {
        long count = store.count("SELECT COUNT(*) FROM sys_user WHERE id=? AND status=1 "
                + "AND (must_change_password=0 OR must_change_password IS NULL)", userId);
        if (count == 0) throw new BusinessException(400, "所選人員不可用");
    }
}

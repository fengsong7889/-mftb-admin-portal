package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import java.sql.Statement;
import java.util.List;

/** 仅接收本模块固定 SQL 与绑定参数，调用方不得传入动态表名或排序表达式。 */
@Repository
@RequiredArgsConstructor
public class DocNativeStore {
    private final JdbcTemplate jdbc;

    /** 必须经方法调用访问目标对象，直接读取 CGLIB 代理字段会得到未初始化的空值。 */
    public JdbcTemplate jdbc() { return jdbc; }

    <T> List<T> rows(String sql, Class<T> type, Object... args) {
        return jdbc.query(sql, new BeanPropertyRowMapper<>(type), args);
    }
    <T> T one(String sql, Class<T> type, Object... args) {
        return rows(sql, type, args).stream().findFirst().orElse(null);
    }
    long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }
    long insert(String sql, Object... args) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i=0; i<args.length; i++) statement.setObject(i+1, args[i]);
            return statement;
        }, keys);
        if (keys.getKey() == null) throw new IllegalStateException("文档写入未取得主键");
        return keys.getKey().longValue();
    }
    Head head(long id, boolean lock) {
        Head head = one("SELECT d.*,n.status AS status,s.name AS space_name,u.name AS owner_name,c.name AS category_name FROM doc_native_document d JOIN doc_node n ON n.id=d.node_id JOIN doc_space s ON s.id=d.space_id AND s.deleted=0 JOIN sys_user u ON u.id=d.owner_user_id LEFT JOIN doc_category c ON c.id=d.category_id WHERE d.node_id=?" + (lock ? " FOR UPDATE" : ""), Head.class, id);
        if (head == null) throw new BusinessException(404, "文檔不存在或不可存取");
        return head;
    }
    Revision revision(long nodeId, long revisionId) {
        Revision revision = one("SELECT * FROM doc_revision WHERE node_id=? AND id=?", Revision.class, nodeId, revisionId);
        if (revision == null) throw new BusinessException(404, "版本不存在或不可存取");
        return revision;
    }
    Confirmation pending(long nodeId) {
        return one("SELECT * FROM doc_confirmation WHERE node_id=? AND status=1 ORDER BY id DESC LIMIT 1", Confirmation.class, nodeId);
    }
    void audit(Long nodeId, long spaceId, long actor, String action, Long revisionId, String detail, String key) {
        jdbc.update("INSERT INTO doc_audit_event(node_id,space_id,actor_user_id,action,revision_id,detail,request_key) VALUES(?,?,?,?,?,?,?)", nodeId,spaceId,actor,action,revisionId,detail,key);
    }
    void bump(long id) {
        jdbc.update("UPDATE doc_native_document SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE node_id=?", id);
    }
}

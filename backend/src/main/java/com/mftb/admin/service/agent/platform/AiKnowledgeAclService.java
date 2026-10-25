package com.mftb.admin.service.agent.platform;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * WP08：知识文档 ACL。授权主体支持 USER / DEPT / ROLE（功能角色 id）/ ROLE_CODE（sys_user.role）。
 *
 * <p>没有匹配行的文档一律不可检索（fail-closed）；系统标签、启用状态、管理员身份都不能代替 ACL。
 * 检索时把主体集合拼成占位符注入两条检索引擎的 SQL，避免先取全量再过滤。
 */
@Service
@RequiredArgsConstructor
public class AiKnowledgeAclService {

    private final JdbcTemplate jdbc;

    /** 当前用户的主体集合；拿不到身份返回空集（调用方应直接拒绝）。 */
    public List<String[]> subjects(SysUser user) {
        if (user == null || user.getId() == null || !Integer.valueOf(1).equals(user.getStatus())) return List.of();
        Set<String> pairs = new LinkedHashSet<>();
        pairs.add("USER\u0000" + user.getId());
        if (user.getDepartmentId() != null) pairs.add("DEPT\u0000" + user.getDepartmentId());
        for (Long roleId : JsonUtils.parseLongList(user.getFunctionRoles())) {
            if (roleId != null) pairs.add("ROLE\u0000" + roleId);
        }
        if (StringUtils.hasText(user.getRole())) pairs.add("ROLE_CODE\u0000" + user.getRole().trim());
        List<String[]> out = new ArrayList<>();
        for (String pair : pairs) {
            String[] parts = pair.split("\u0000", 2);
            out.add(parts);
        }
        return out;
    }

    /** 生成 (subject_type=? AND subject_id=? OR ...) 片段及其参数。 */
    public String subjectClause(List<String[]> subjects, List<Object> args, String alias) {
        if (subjects == null || subjects.isEmpty()) return "1=0";
        StringBuilder sb = new StringBuilder("(");
        for (int i = 0; i < subjects.size(); i++) {
            if (i > 0) sb.append(" OR ");
            sb.append("(").append(alias).append(".subject_type=? AND ").append(alias).append(".subject_id=?)");
            args.add(subjects.get(i)[0]);
            args.add(subjects.get(i)[1]);
        }
        return sb.append(")").toString();
    }

    public List<Map<String, Object>> list(Long docId) {
        if (docId == null) throw new BusinessException("缺少文檔 ID");
        return jdbc.queryForList("SELECT id, doc_id, subject_type, subject_id, permission, created_by, created_at "
                + "FROM ai_knowledge_acl WHERE doc_id=? ORDER BY id", docId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void grant(Long docId, String subjectType, String subjectId, String operator) {
        if (docId == null) throw new BusinessException("缺少文檔 ID");
        if (!List.of("USER", "DEPT", "ROLE", "ROLE_CODE").contains(subjectType)) {
            throw new BusinessException("不支持的授權主體類型");
        }
        if (!StringUtils.hasText(subjectId) || subjectId.length() > 64) throw new BusinessException("請填寫授權主體標識");
        Integer docExists = jdbc.queryForObject("SELECT COUNT(*) FROM ai_knowledge_doc WHERE id=?", Integer.class, docId);
        if (docExists == null || docExists == 0) throw new BusinessException(404, "知識文檔不存在");
        jdbc.update("INSERT INTO ai_knowledge_acl(doc_id, subject_type, subject_id, permission, created_by) "
                + "VALUES(?,?,?,'read',?) ON DUPLICATE KEY UPDATE created_by=VALUES(created_by)", docId, subjectType, subjectId, operator);
    }

    @Transactional(rollbackFor = Exception.class)
    public void revoke(Long docId, String subjectType, String subjectId) {
        jdbc.update("DELETE FROM ai_knowledge_acl WHERE doc_id=? AND subject_type=? AND subject_id=?",
                docId, subjectType, subjectId);
    }

    /** 文档级复核：用于读取详情前再次确认（撤权立即生效）。 */
    public boolean canRead(Long docId, SysUser user) {
        List<String[]> subjects = subjects(user);
        if (docId == null || subjects.isEmpty()) return false;
        List<Object> args = new ArrayList<>();
        args.add(docId);
        String clause = subjectClause(subjects, args, "a");
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM ai_knowledge_acl a WHERE a.doc_id=? AND a.permission='read' AND "
                + clause, Integer.class, args.toArray());
        return count != null && count > 0;
    }
}

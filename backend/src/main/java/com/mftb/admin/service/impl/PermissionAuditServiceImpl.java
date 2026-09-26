package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PermissionAuditVO;
import com.mftb.admin.service.PermissionAuditService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 授权变更审计实现：直接写 {@code sys_permission_audit_log}（JdbcTemplate，与迁移框架建表解耦）。
 * <p>不加 {@code @Transactional} 传播控制——由调用方（授权写路径）的事务承载，
 * 插入失败异常向上抛出 → 业务保存整体回滚，杜绝"改了授权没留痕"。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionAuditServiceImpl implements PermissionAuditService {

    private static final int SNAPSHOT_MAX_LEN = 60000;
    private static final int TARGET_NAME_MAX_LEN = 128;

    private final JdbcTemplate jdbcTemplate;
    private final OperatorResolver operatorResolver;

    private static final RowMapper<PermissionAuditVO> ROW_MAPPER = (rs, rowNum) -> {
        PermissionAuditVO vo = new PermissionAuditVO();
        vo.setId(rs.getLong("id"));
        vo.setTargetType(rs.getString("target_type"));
        vo.setTargetId(rs.getLong("target_id"));
        vo.setTargetName(rs.getString("target_name"));
        vo.setSystemCode(rs.getString("system_code"));
        vo.setChangeType(rs.getString("change_type"));
        vo.setBeforeSnapshot(rs.getString("before_snapshot"));
        vo.setAfterSnapshot(rs.getString("after_snapshot"));
        vo.setOperator(rs.getString("operator"));
        Timestamp createdAt = rs.getTimestamp("created_at");
        vo.setCreatedAt(createdAt == null ? null : createdAt.toLocalDateTime());
        return vo;
    };

    @Override
    public void record(String targetType, Long targetId, String targetName,
                       String systemCode, String changeType, Object before, Object after) {
        if (!StringUtils.hasText(targetType) || targetId == null || !StringUtils.hasText(changeType)) {
            throw new BusinessException("審計記錄缺少必要字段(targetType/targetId/changeType)");
        }
        String name = StringUtils.hasText(targetName) ? targetName : lookupTargetName(targetType, targetId);
        if (name != null && name.length() > TARGET_NAME_MAX_LEN) {
            name = name.substring(0, TARGET_NAME_MAX_LEN);
        }
        jdbcTemplate.update(
                "INSERT INTO sys_permission_audit_log "
                        + "(target_type, target_id, target_name, system_code, change_type, before_snapshot, after_snapshot, operator) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                targetType, targetId, name,
                StringUtils.hasText(systemCode) ? systemCode : null,
                changeType, truncate(toJson(before)), truncate(toJson(after)),
                operatorResolver.currentOperatorName());
    }

    @Override
    public PageResult<PermissionAuditVO> query(String targetType, Long targetId, String changeType,
                                               String operator, LocalDateTime startTime, LocalDateTime endTime,
                                               long page, long pageSize) {
        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(targetType)) {
            where.append(" AND target_type = ?");
            args.add(targetType);
        }
        if (targetId != null) {
            where.append(" AND target_id = ?");
            args.add(targetId);
        }
        if (StringUtils.hasText(changeType)) {
            where.append(" AND change_type = ?");
            args.add(changeType);
        }
        if (StringUtils.hasText(operator)) {
            where.append(" AND operator LIKE ?");
            args.add("%" + operator.trim() + "%");
        }
        if (startTime != null) {
            where.append(" AND created_at >= ?");
            args.add(startTime);
        }
        if (endTime != null) {
            where.append(" AND created_at <= ?");
            args.add(endTime);
        }
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_permission_audit_log" + where, Long.class, args.toArray());
        long size = PageResult.normalizeSize(pageSize);
        long offset = (PageResult.normalizePage(page) - 1) * size;
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add(offset);
        List<PermissionAuditVO> records = jdbcTemplate.query(
                "SELECT id, target_type, target_id, target_name, system_code, change_type, "
                        + "before_snapshot, after_snapshot, operator, created_at "
                        + "FROM sys_permission_audit_log" + where
                        + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                ROW_MAPPER, pageArgs.toArray());
        return new PageResult<>(records, total == null ? 0L : total);
    }

    @Override
    public List<PermissionAuditVO> recentOf(String targetType, Long targetId, int limit) {
        if (!StringUtils.hasText(targetType) || targetId == null) {
            return List.of();
        }
        return jdbcTemplate.query(
                "SELECT id, target_type, target_id, target_name, system_code, change_type, "
                        + "before_snapshot, after_snapshot, operator, created_at "
                        + "FROM sys_permission_audit_log WHERE target_type = ? AND target_id = ? "
                        + "ORDER BY created_at DESC, id DESC LIMIT ?",
                ROW_MAPPER, targetType, targetId, Math.max(1, Math.min(limit, 50)));
    }

    /** 尽力回查目标名称（角色/部门），查询失败不阻断审计写入。 */
    private String lookupTargetName(String targetType, Long targetId) {
        try {
            String sql = TARGET_ROLE.equals(targetType)
                    ? "SELECT name FROM sys_role WHERE id = ? AND deleted = 0"
                    : "SELECT name FROM sys_department WHERE id = ? AND deleted = 0";
            List<String> names = jdbcTemplate.queryForList(sql, String.class, targetId);
            return names.isEmpty() ? null : names.get(0);
        } catch (RuntimeException e) {
            log.warn("审计回查目标名称失败: type={}, id={}", targetType, targetId, e);
            return null;
        }
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        return value instanceof String s ? s : JsonUtils.toJson(value);
    }

    /** TEXT 列防御式截断，避免极端大的快照撑爆语句包。 */
    private String truncate(String json) {
        if (json == null || json.length() <= SNAPSHOT_MAX_LEN) {
            return json;
        }
        return json.substring(0, SNAPSHOT_MAX_LEN) + "...(truncated)";
    }
}

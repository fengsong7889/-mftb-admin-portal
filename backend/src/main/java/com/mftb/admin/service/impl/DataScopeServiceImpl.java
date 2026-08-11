package com.mftb.admin.service.impl;

import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.service.DataScopeService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 数据范围服务实现
 * <p>
 * 解析当前用户可见的商家集团编码集合, 来源:
 * 功能角色授权(sys_data_authorization.target_type='role')
 * ∪ 部门授权(sys_data_authorization.target_type='department')
 * <p>
 * 超管(sys_user.role=admin 或 functionRoles 绑定 sys_admin 角色) 返回 null 不限制;
 * 无授权返回空集合(严格模式).
 * 结果按用户缓存 5 分钟.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataScopeServiceImpl implements DataScopeService {

    /** 系统内置超管标识: sys_role.code 字段值（与 sys_role 种子数据对齐） */
    private static final String SUPER_ADMIN_ROLE_CODE = "admin";

    /** 缓存 TTL: 5 分钟 */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private final JdbcTemplate jdbcTemplate;
    private final OperatorResolver operatorResolver;
    private final SysRoleMapper sysRoleMapper;

    /** userId -> 缓存 */
    private final ConcurrentHashMap<Long, ScopeCache> cacheMap = new ConcurrentHashMap<>();

    private record ScopeCache(Set<String> groupCodes, long expireAt) {
    }

    @Override
    public Set<String> resolveAuthorizedGroupCodes() {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            return Set.of();
        }
        // 超管直通 1: sys_user.role=admin 返回 null 表示不限制
        if ("admin".equalsIgnoreCase(user.getRole())) {
            return null;
        }
        // 超管直通 2: functionRoles 绑定 sys_admin 角色同样直通（与 PermissionServiceImpl 对齐）
        if (isBoundSuperAdmin(user)) {
            return null;
        }
        // 查缓存
        ScopeCache cache = cacheMap.compute(user.getId(), (id, existing) -> {
            if (existing != null && existing.expireAt() > System.currentTimeMillis()) {
                return existing;
            }
            return load(user);
        });
        return cache.groupCodes();
    }

    /**
     * 判定用户是否通过 functionRoles 绑定了 sys_admin 角色（超管）。
     * 与 PermissionServiceImpl 的超管判定逻辑保持一致。
     */
    private boolean isBoundSuperAdmin(SysUser user) {
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        if (roleIds.isEmpty()) {
            return false;
        }
        List<SysRole> roles = sysRoleMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysRole>()
                        .in(SysRole::getId, roleIds)
                        .eq(SysRole::getStatus, 1));
        return roles.stream().anyMatch(r -> SUPER_ADMIN_ROLE_CODE.equals(r.getCode()));
    }

    @Override
    public void evictAll() {
        cacheMap.clear();
        log.info("数据范围缓存已清空");
    }

    /** 加载用户的数据范围: 角色授权 ∪ 部门授权 */
    private ScopeCache load(SysUser user) {
        Set<String> groupCodes = new HashSet<>();

        // 1. 角色授权
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        if (!roleIds.isEmpty()) {
            String inClause = roleIds.stream().map(String::valueOf).collect(Collectors.joining(","));
            List<String> roleGroups = jdbcTemplate.queryForList(
                    "SELECT DISTINCT group_code FROM sys_data_authorization "
                            + "WHERE target_type = 'role' AND target_id IN (" + inClause + ") "
                            + "AND status = 1 AND deleted = 0",
                    String.class);
            groupCodes.addAll(roleGroups);
        }

        // 2. 部门授权
        if (user.getDepartmentId() != null) {
            List<String> deptGroups = jdbcTemplate.queryForList(
                    "SELECT DISTINCT group_code FROM sys_data_authorization "
                            + "WHERE target_type = 'department' AND target_id = ? "
                            + "AND status = 1 AND deleted = 0",
                    String.class,
                    user.getDepartmentId());
            groupCodes.addAll(deptGroups);
        }

        return new ScopeCache(groupCodes, System.currentTimeMillis() + CACHE_TTL_MS);
    }
}

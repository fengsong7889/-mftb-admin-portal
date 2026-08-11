package com.mftb.admin.service.impl;

import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 员工操作权限服务实现
 * <p>
 * 权限来源: 员工绑定的功能角色(sys_role_menu) ∪ 所在部门(sys_department_menu),
 * 仅统计启用的角色/部门与启用的菜单; 权限结果按用户缓存 5 分钟
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionServiceImpl implements PermissionService {

    /** 权限缓存 TTL (毫秒), 与 JwtAuthenticationFilter 活跃节流间隔一致 */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    /** 系统内置超管标识: sys_user.role 字段值 */
    private static final String SUPER_ADMIN_ROLE = "admin";
    /** 系统内置超管标识: sys_role.code 字段值（与 sys_role 种子数据对齐） */
    private static final String SUPER_ADMIN_ROLE_CODE = "admin";

    private final JdbcTemplate jdbcTemplate;

    /** 用户权限缓存: userId -> 权限快照 */
    private final ConcurrentHashMap<Long, PermissionCache> cacheMap = new ConcurrentHashMap<>();

    /** 权限快照: 超管标记 + menuKey -> actions 集合 */
    private record PermissionCache(boolean superAdmin, Map<String, Set<String>> perms, long expireAt) {
    }

    @Override
    public boolean hasPermission(SysUser user, String menuKey, String action) {
        if (user == null || user.getId() == null) {
            return false;
        }
        // 内置 admin 角色直通, 无需查库与缓存
        if (SUPER_ADMIN_ROLE.equalsIgnoreCase(user.getRole())) {
            return true;
        }
        PermissionCache cache = cacheMap.compute(user.getId(), (id, existing) -> {
            if (existing != null && existing.expireAt() > System.currentTimeMillis()) {
                return existing;
            }
            return load(user);
        });
        // 绑定 sys_admin 角色的超管直通, 不进缓存
        if (cache.superAdmin()) {
            cacheMap.remove(user.getId());
            return true;
        }
        Set<String> actions = cache.perms().get(menuKey);
        return actions != null && actions.contains(action);
    }

    @Override
    public void evictAll() {
        cacheMap.clear();
        log.info("权限缓存已清空");
    }

    /** 加载员工有效权限: 角色授权 ∪ 部门授权 */
    private PermissionCache load(SysUser user) {
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        boolean superAdmin = false;
        Map<String, Set<String>> perms = new HashMap<>();

        if (!roleIds.isEmpty()) {
            String inClause = roleIds.stream().map(String::valueOf).collect(Collectors.joining(","));
            // 超管判定: 绑定 sys_admin 角色
            List<String> codes = jdbcTemplate.queryForList(
                    "SELECT code FROM sys_role WHERE id IN (" + inClause + ") AND deleted = 0 AND status = 1",
                    String.class);
            superAdmin = codes.contains(SUPER_ADMIN_ROLE_CODE);
            // 角色菜单授权 (仅启用角色 + 启用菜单)
            if (!superAdmin) {
                RowMapper<Void> roleMenuMapper = (rs, rowNum) -> {
                    merge(perms, rs.getString("menu_key"), rs.getString("actions"));
                    return null;
                };
                jdbcTemplate.query(
                        "SELECT m.menu_key, rm.actions FROM sys_role_menu rm "
                                + "JOIN sys_role r ON rm.role_id = r.id AND r.deleted = 0 AND r.status = 1 "
                                + "JOIN sys_menu m ON rm.menu_id = m.id AND m.deleted = 0 AND m.status = 1 "
                                + "WHERE rm.role_id IN (" + inClause + ")",
                        roleMenuMapper);
            }
        }

        // 部门菜单授权 (仅有效部门 + 启用菜单)
        if (!superAdmin && user.getDepartmentId() != null) {
            RowMapper<Void> deptMenuMapper = (rs, rowNum) -> {
                merge(perms, rs.getString("menu_key"), rs.getString("actions"));
                return null;
            };
            jdbcTemplate.query(
                    "SELECT m.menu_key, dm.actions FROM sys_department_menu dm "
                            + "JOIN sys_department d ON dm.dept_id = d.id AND d.deleted = 0 AND d.status = 1 "
                            + "JOIN sys_menu m ON dm.menu_id = m.id AND m.deleted = 0 AND m.status = 1 "
                            + "WHERE dm.dept_id = ?",
                    deptMenuMapper,
                    user.getDepartmentId());
        }

        return new PermissionCache(superAdmin, perms, System.currentTimeMillis() + CACHE_TTL_MS);
    }

    /** 合并单个菜单的授权操作: actions 为空视为仅 view */
    private void merge(Map<String, Set<String>> perms, String menuKey, String actionsJson) {
        if (menuKey == null || menuKey.isBlank()) {
            return;
        }
        List<String> actions = JsonUtils.parseStringList(actionsJson);
        Set<String> set = perms.computeIfAbsent(menuKey, k -> new HashSet<>());
        if (actions.isEmpty()) {
            set.add("view");
        } else {
            set.addAll(actions);
        }
    }
}

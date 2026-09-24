package com.mftb.admin.service.impl;

import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionRevisionService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
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
    private final PermissionRevisionService revisionService;

    /** 用户权限缓存: userId -> 权限快照 */
    private final ConcurrentHashMap<Long, PermissionCache> cacheMap = new ConcurrentHashMap<>();

    /** 权限快照: 超管标记 + menuKey -> actions 集合 + 可访问系统集合（保留插入顺序作为 sort 序）+ 创建时的全局权限 revision */
    private record PermissionCache(boolean superAdmin, Map<String, Set<String>> perms, LinkedHashSet<String> accessibleSystems, long revision, long expireAt) {
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
        PermissionCache cache = obtainCache(user);
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
        // 同步递增全局权限 revision，确保其他实例下次读时自动重新加载。
        // bump() 在写侧事务内共享事务；无事务时自动包一个。失败抛出 → 上层事务回滚，不允许默默失败。
        revisionService.bump();
        log.info("权限缓存已清空，且全局 revision 已递增");
    }

    @Override
    public boolean hasSystemAccess(SysUser user, String systemCode) {
        if (user == null || systemCode == null || systemCode.isBlank()) {
            return false;
        }
        // 内置超管直通
        if (SUPER_ADMIN_ROLE.equalsIgnoreCase(user.getRole())) {
            return true;
        }
        PermissionCache cache = obtainCache(user);
        if (cache.superAdmin()) {
            cacheMap.remove(user.getId());
            return true;
        }
        return cache.accessibleSystems().contains(systemCode);
    }

    @Override
    public List<String> listAccessibleSystems(SysUser user) {
        if (user == null) {
            return List.of();
        }
        if (SUPER_ADMIN_ROLE.equalsIgnoreCase(user.getRole())) {
            return queryAllEnabledSystemCodes();
        }
        PermissionCache cache = obtainCache(user);
        if (cache.superAdmin()) {
            cacheMap.remove(user.getId());
            return queryAllEnabledSystemCodes();
        }
        return List.copyOf(cache.accessibleSystems());
    }

    /**
     * 获取或刷新用户权限快照。与旧实现区别：命中时额外比对 revision，
     * 库内 revision 一变 → 本实例自动重新加载，不依赖 evictAll 跨实例传递。
     */
    private PermissionCache obtainCache(SysUser user) {
        long currentRevision = revisionService.currentRevision();
        return cacheMap.compute(user.getId(), (id, existing) -> {
            boolean fresh = existing != null
                    && existing.expireAt() > System.currentTimeMillis()
                    && existing.revision() == currentRevision;
            if (fresh) {
                return existing;
            }
            return load(user, currentRevision);
        });
    }

    private List<String> queryAllEnabledSystemCodes() {
        return jdbcTemplate.queryForList(
                "SELECT code FROM sys_system WHERE deleted = 0 AND status = 1 ORDER BY sort_order, code",
                String.class);
    }

    @Override
    public String resolveSystemCodeOfMenu(String menuKey) {
        if (menuKey == null || menuKey.isBlank()) {
            return null;
        }
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT system_code FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                    String.class, menuKey);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            // 未登记菜单→null，调用方选择跳过系统准入（与菜单归属列为 NULL 时行为一致）
            return null;
        }
    }

    /** 加载员工有效权限: 菜单动作 与 可访问系统 均为 角色 ∪ 部门，仅启用项 */
    private PermissionCache load(SysUser user, long revision) {
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        boolean superAdmin = false;
        Map<String, Set<String>> perms = new HashMap<>();
        LinkedHashSet<String> accessibleSystems = new LinkedHashSet<>();

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
                // 角色系统准入（保留插入顺序供门户卡片排序）
                jdbcTemplate.query(
                        "SELECT rs.system_code FROM sys_role_system rs "
                                + "JOIN sys_role r ON rs.role_id = r.id AND r.deleted = 0 AND r.status = 1 "
                                + "JOIN sys_system s ON s.code = rs.system_code AND s.deleted = 0 AND s.status = 1 "
                                + "WHERE rs.role_id IN (" + inClause + ") "
                                + "ORDER BY s.sort_order, s.code",
                        (rs, rowNum) -> {
                            accessibleSystems.add(rs.getString("system_code"));
                            return null;
                        });
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
            // 部门系统准入
            jdbcTemplate.query(
                    "SELECT ds.system_code FROM sys_department_system ds "
                            + "JOIN sys_department d ON ds.dept_id = d.id AND d.deleted = 0 AND d.status = 1 "
                            + "JOIN sys_system s ON s.code = ds.system_code AND s.deleted = 0 AND s.status = 1 "
                            + "WHERE ds.dept_id = ? "
                            + "ORDER BY s.sort_order, s.code",
                    (rs, rowNum) -> {
                        accessibleSystems.add(rs.getString("system_code"));
                        return null;
                    },
                    user.getDepartmentId());
        }

        return new PermissionCache(superAdmin, perms, accessibleSystems, revision, System.currentTimeMillis() + CACHE_TTL_MS);
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

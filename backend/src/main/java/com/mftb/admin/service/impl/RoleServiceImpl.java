package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.RoleRequest;
import com.mftb.admin.dto.RoleVO;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysRoleMenu;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysRoleMenuMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RoleService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 功能角色服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RoleServiceImpl implements RoleService {

    private final SysRoleMapper sysRoleMapper;
    private final SysRoleMenuMapper sysRoleMenuMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;
    private final PermissionService permissionService;

    @Override
    public List<RoleVO> list() {
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>().orderByAsc(SysRole::getId));
        // 统计每个角色绑定的账号数
        Map<Long, Long> countMap = new LinkedHashMap<>();
        List<SysUser> users = sysUserMapper.selectList(null);
        for (SysUser user : users) {
            for (Long roleId : JsonUtils.parseLongList(user.getFunctionRoles())) {
                countMap.merge(roleId, 1L, Long::sum);
            }
        }
        Map<Long, List<MenuPermissionDTO>> permissionsMap = loadPermissionsMap(
                roles.stream().map(SysRole::getId).toList());
        return roles.stream()
                .map(role -> toVO(role, countMap.getOrDefault(role.getId(), 0L),
                        permissionsMap.getOrDefault(role.getId(), List.of())))
                .toList();
    }

    @Override
    @Transactional
    public RoleVO create(RoleRequest request) {
        SysRole role = new SysRole();
        role.setName(request.getName());
        // code 唯一约束, 自动生成
        role.setCode("role_" + System.currentTimeMillis());
        role.setDescription(request.getDescription());
        role.setStatus(1);
        role.setDeleted(0);
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.insert(role);
        saveRoleMenus(role.getId(), request.getPermissions());
        permissionService.evictAll();
        return toVO(role, 0L, loadPermissions(role.getId()));
    }

    @Override
    public RoleVO update(Long id, RoleRequest request) {
        SysRole role = requireRole(id);
        role.setName(request.getName());
        role.setDescription(request.getDescription());
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.updateById(role);
        return toVO(role, null, loadPermissions(role.getId()));
    }

    @Override
    @Transactional
    public void updatePermissions(Long id, List<MenuPermissionDTO> permissions) {
        requireRole(id);
        saveRoleMenus(id, permissions);
        permissionService.evictAll();
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysRole role = requireRole(id);
        role.setStatus(status);
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.updateById(role);
        permissionService.evictAll();
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireRole(id);
        sysRoleMapper.deleteById(id);
        // 清理角色菜单关联
        sysRoleMenuMapper.delete(
                new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, id));
        // 从所有员工的绑定中移除该角色
        List<SysUser> users = sysUserMapper.selectList(null);
        for (SysUser user : users) {
            List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
            if (roleIds.remove(id)) {
                user.setFunctionRoles(JsonUtils.toJson(roleIds));
                sysUserMapper.updateById(user);
            }
        }
        permissionService.evictAll();
    }

    @Override
    public List<Long> boundUserIds(Long roleId) {
        List<Long> userIds = new ArrayList<>();
        for (SysUser user : sysUserMapper.selectList(null)) {
            if (JsonUtils.parseLongList(user.getFunctionRoles()).contains(roleId)) {
                userIds.add(user.getId());
            }
        }
        return userIds;
    }

    @Override
    @Transactional
    public void bindUsers(Long roleId, List<Long> userIds) {
        requireRole(roleId);
        Set<Long> targetIds = new LinkedHashSet<>(userIds == null ? List.of() : userIds);
        for (SysUser user : sysUserMapper.selectList(null)) {
            List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
            boolean bound = roleIds.contains(roleId);
            boolean shouldBind = targetIds.contains(user.getId());
            if (bound == shouldBind) {
                continue;
            }
            if (shouldBind) {
                roleIds.add(roleId);
            } else {
                roleIds.remove(roleId);
            }
            user.setFunctionRoles(JsonUtils.toJson(roleIds));
            sysUserMapper.updateById(user);
        }
        permissionService.evictAll();
    }

    @Override
    public List<MenuPermissionDTO> mergePermissions(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return List.of();
        }
        String inClause = roleIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT m.menu_key, rm.actions "
                        + "FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON rm.menu_id = m.id "
                        + "WHERE rm.role_id IN (" + inClause + ") "
                        + "AND m.status = 1 AND m.deleted = 0");
        // 按 menuKey 合并操作集合
        Map<String, Set<String>> merged = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String menuKey = (String) row.get("menu_key");
            List<String> actions = JsonUtils.parseStringList((String) row.get("actions"));
            merged.computeIfAbsent(menuKey, k -> new LinkedHashSet<>()).addAll(actions);
        }
        List<MenuPermissionDTO> result = new ArrayList<>();
        merged.forEach((menuKey, actions) -> {
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey(menuKey);
            dto.setActions(new ArrayList<>(actions));
            result.add(dto);
        });
        return result;
    }

    /** 保存角色菜单权限: 先清空再批量写入 */
    private void saveRoleMenus(Long roleId, List<MenuPermissionDTO> permissions) {
        sysRoleMenuMapper.delete(
                new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, roleId));
        if (CollectionUtils.isEmpty(permissions)) {
            return;
        }
        for (MenuPermissionDTO perm : permissions) {
            if (!StringUtils.hasText(perm.getMenuKey())) {
                continue;
            }
            Long menuId = resolveMenuId(perm.getMenuKey().trim());
            if (menuId == null) {
                continue;
            }
            SysRoleMenu relation = new SysRoleMenu();
            relation.setRoleId(roleId);
            relation.setMenuId(menuId);
            relation.setActions(JsonUtils.toJson(perm.getActions()));
            sysRoleMenuMapper.insert(relation);
        }
    }

    /** 根据 menuKey 获取菜单ID, 不存在时自动创建占位菜单 */
    private Long resolveMenuId(String menuKey) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, menuKey);
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, type, status, deleted, sort_order) "
                        + "VALUES (NULL, ?, ?, 2, 1, 0, 0)",
                menuKey, menuKey);
        Long menuId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        log.warn("角色权限保存时发现菜单 [{}] 不存在, 已自动创建占位菜单 (id={})", menuKey, menuId);
        return menuId;
    }

    private RoleVO toVO(SysRole role, Long userCount, List<MenuPermissionDTO> permissions) {
        RoleVO vo = new RoleVO();
        vo.setId(role.getId());
        vo.setName(role.getName());
        vo.setDescription(role.getDescription());
        vo.setStatus(role.getStatus());
        vo.setPermissions(permissions == null ? List.of() : permissions);
        vo.setUserCount(userCount);
        vo.setCreatedAt(role.getCreatedAt());
        vo.setUpdatedBy(role.getUpdatedBy());
        vo.setUpdatedAt(role.getUpdatedAt());
        return vo;
    }

    /** 从 sys_role_menu + sys_menu 加载角色权限 */
    private List<MenuPermissionDTO> loadPermissions(Long roleId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT m.menu_key, rm.actions "
                        + "FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON rm.menu_id = m.id "
                        + "WHERE rm.role_id = ? AND m.deleted = 0",
                roleId);
        List<MenuPermissionDTO> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            dto.setActions(JsonUtils.parseStringList((String) row.get("actions")));
            result.add(dto);
        }
        return result;
    }

    /** 批量加载多个角色权限, 按 roleId 分组 */
    private Map<Long, List<MenuPermissionDTO>> loadPermissionsMap(List<Long> roleIds) {
        Map<Long, List<MenuPermissionDTO>> result = new HashMap<>();
        if (CollectionUtils.isEmpty(roleIds)) {
            return result;
        }
        String inClause = roleIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT rm.role_id, m.menu_key, rm.actions "
                        + "FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON rm.menu_id = m.id "
                        + "WHERE rm.role_id IN (" + inClause + ") AND m.deleted = 0");
        for (Map<String, Object> row : rows) {
            Long roleId = ((Number) row.get("role_id")).longValue();
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            dto.setActions(JsonUtils.parseStringList((String) row.get("actions")));
            result.computeIfAbsent(roleId, k -> new ArrayList<>()).add(dto);
        }
        return result;
    }

    private SysRole requireRole(Long id) {
        SysRole role = sysRoleMapper.selectById(id);
        if (role == null) {
            throw new BusinessException("角色不存在");
        }
        return role;
    }
}

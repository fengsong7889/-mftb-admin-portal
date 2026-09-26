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
import com.mftb.admin.service.PermissionAuditService;
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

    /** 内置超级管理员角色编码（与 PermissionServiceImpl.SUPER_ADMIN_ROLE_CODE 对齐）：
     *  绑定该角色即获得超管直通权限，因此禁止绑定账号/删除/停用，防止权限旁路扩散 */
    private static final String BUILTIN_ADMIN_ROLE_CODE = "admin";

    private final SysRoleMapper sysRoleMapper;
    private final SysRoleMenuMapper sysRoleMenuMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;
    private final PermissionService permissionService;
    private final PermissionAuditService permissionAuditService;

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
        assertNameUnique(request.getName(), null);
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
        assertNameUnique(request.getName(), id);
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
        // Round 5 · 旧写入口告警：全量写会跨系统覆盖，与新的原子写接口
        // （PUT /api/roles/{id}/systems/{code}/authorization）并存时容易引发误操作；
        // 保留向后兼容，仅记录 warn，为未来一个 cycle 删除提供依据。
        log.warn("[deprecated-path] RoleServiceImpl.updatePermissions 正在全量覆盖角色 {} 的菜单授权（跨系统）；推荐前端迁移到授权中心原子写接口", id);
        List<MenuPermissionDTO> before = loadPermissions(id);
        saveRoleMenus(id, permissions);
        List<MenuPermissionDTO> after = loadPermissions(id);
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, id, null, null,
                auditTypeOfFullWrite(before, after), before, after);
        permissionService.evictAll();
    }

    /** 全量写变更的审计类型：首次授权 GRANT，清空 DELETE，其余 UPDATE。 */
    private String auditTypeOfFullWrite(List<MenuPermissionDTO> before, List<MenuPermissionDTO> after) {
        if (after.isEmpty()) {
            return before.isEmpty() ? PermissionAuditService.CHANGE_UPDATE : PermissionAuditService.CHANGE_DELETE;
        }
        return before.isEmpty() ? PermissionAuditService.CHANGE_GRANT : PermissionAuditService.CHANGE_UPDATE;
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysRole role = requireRole(id);
        if (isBuiltinAdminRole(role)) {
            throw new BusinessException("內置超級管理員角色不允許停用/啟用");
        }
        Integer oldStatus = role.getStatus();
        role.setStatus(status);
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.updateById(role);
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, id, role.getName(), null,
                PermissionAuditService.CHANGE_STATUS,
                Map.of("status", oldStatus == null ? -1 : oldStatus),
                Map.of("status", status == null ? -1 : status));
        permissionService.evictAll();
    }

    @Override
    @Transactional
    public void delete(Long id) {
        SysRole role = requireRole(id);
        if (isBuiltinAdminRole(role)) {
            throw new BusinessException("內置超級管理員角色不允許刪除");
        }
        // 审计快照需在删除前采集（删后名称/授权均不可回溯）
        List<MenuPermissionDTO> before = loadPermissions(id);
        sysRoleMapper.deleteById(id);
        // 清理角色菜单关联
        sysRoleMenuMapper.delete(
                new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, id));
        jdbcTemplate.update("DELETE FROM sys_role_system WHERE role_id = ?", id);
        // 从所有员工的绑定中移除该角色
        List<SysUser> users = sysUserMapper.selectList(null);
        for (SysUser user : users) {
            List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
            if (roleIds.remove(id)) {
                user.setFunctionRoles(JsonUtils.toJson(roleIds));
                sysUserMapper.updateById(user);
            }
        }
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, id, role.getName(), null,
                PermissionAuditService.CHANGE_DELETE, before, List.of());
        permissionService.evictAll();
    }

    @Override
    @Transactional
    public RoleVO copy(Long id, RoleRequest request) {
        SysRole source = requireRole(id);
        assertNameUnique(request.getName(), null);
        SysRole role = new SysRole();
        role.setName(request.getName());
        role.setCode("role_" + System.currentTimeMillis());
        role.setDescription(StringUtils.hasText(request.getDescription())
                ? request.getDescription() : "復制自：" + source.getName());
        role.setStatus(1);
        role.setDeleted(0);
        role.setUpdatedBy(operatorResolver.currentOperatorName());
        sysRoleMapper.insert(role);
        // 克隆菜单授权与系统准入（行级复制，保留 actions JSON）
        int menuCopied = jdbcTemplate.update(
                "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                        + "SELECT ?, menu_id, actions FROM sys_role_menu WHERE role_id = ?",
                role.getId(), id);
        int systemCopied = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT ?, system_code FROM sys_role_system WHERE role_id = ?",
                role.getId(), id);
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, role.getId(), role.getName(), null,
                PermissionAuditService.CHANGE_COPY,
                Map.of("fromRoleId", id, "fromRoleName", source.getName()),
                Map.of("menuCopied", menuCopied, "systemCopied", systemCopied));
        permissionService.evictAll();
        log.info("角色已复制: source={}({}) -> new={}({}), menu={}, system={}",
                source.getName(), id, role.getName(), role.getId(), menuCopied, systemCopied);
        return toVO(role, 0L, loadPermissions(role.getId()));
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
        SysRole role = requireRole(roleId);
        List<Long> beforeIds = boundUserIds(roleId);
        Set<Long> targetIds = new LinkedHashSet<>(userIds == null ? List.of() : userIds);
        // 内置超管角色：只允许解绑（收敛历史误绑），禁止新增绑定任何账号
        if (isBuiltinAdminRole(role)) {
            List<Long> additions = targetIds.stream().filter(u -> !beforeIds.contains(u)).toList();
            if (!additions.isEmpty()) {
                throw new BusinessException("超級管理員為內置角色，綁定即獲得全部權限，不允許綁定賬號");
            }
        }
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
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, roleId, null,
                null, PermissionAuditService.CHANGE_BIND,
                Map.of("userIds", beforeIds),
                Map.of("userIds", new ArrayList<>(targetIds)));
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
            // 空 actions（如种子遗漏 NULL）视为仅查看，与 PermissionServiceImpl 语义对齐，避免受控菜单整项隐藏
            if (actions.isEmpty()) {
                actions.add("view");
            }
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey(menuKey);
            dto.setActions(new ArrayList<>(actions));
            result.add(dto);
        });
        return result;
    }

    @Override
    public List<String> codesOf(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return List.of();
        }
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>()
                        .in(SysRole::getId, roleIds)
                        .eq(SysRole::getStatus, 1));
        return roles.stream()
                .map(SysRole::getCode)
                .filter(code -> code != null && !code.isBlank())
                .toList();
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
        vo.setCode(role.getCode());
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
            List<String> actionList = new ArrayList<>(JsonUtils.parseStringList((String) row.get("actions")));
            // 空 actions 视为仅查看（与 PermissionServiceImpl 语义对齐）
            if (actionList.isEmpty()) {
                actionList.add("view");
            }
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            dto.setActions(actionList);
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
            List<String> actionList = new ArrayList<>(JsonUtils.parseStringList((String) row.get("actions")));
            // 空 actions 视为仅查看（与 PermissionServiceImpl 语义对齐）
            if (actionList.isEmpty()) {
                actionList.add("view");
            }
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            dto.setActions(actionList);
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

    /** 是否内置超级管理员角色（code=admin，绑定即超管直通，需重点保护） */
    private boolean isBuiltinAdminRole(SysRole role) {
        return role != null && BUILTIN_ADMIN_ROLE_CODE.equalsIgnoreCase(role.getCode());
    }

    /** 角色名稱唯一性校驗（排除自身；@TableLogic 自動過濾已刪除記錄） */
    private void assertNameUnique(String name, Long excludeId) {
        if (!StringUtils.hasText(name)) {
            return;
        }
        Long count = sysRoleMapper.selectCount(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getName, name.trim())
                .ne(excludeId != null, SysRole::getId, excludeId));
        if (count != null && count > 0) {
            throw new BusinessException("角色名稱已存在：" + name.trim());
        }
    }
}

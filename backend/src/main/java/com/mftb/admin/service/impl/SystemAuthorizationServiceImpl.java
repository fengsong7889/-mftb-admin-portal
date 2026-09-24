package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.SystemAuthorizationRequest;
import com.mftb.admin.dto.SystemAuthorizationVO;
import com.mftb.admin.service.PermissionRevisionService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SystemAuthorizationService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 系统授权读写实现（Round 3 · 单目标 × 单系统原子保存）。
 * <p>依赖 {@link PermissionService#evictAll()} 在同一事务内递增全局 revision，
 * 保证其他实例下一次权限读取自动重新加载，杜绝"实例 A 撤权、实例 B 依旧放行"。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SystemAuthorizationServiceImpl implements SystemAuthorizationService {

    /** 与 {@code PermissionServiceImpl.SUPER_ADMIN_ROLE_CODE} 对齐：内置 admin 角色不落 sys_role_system。 */
    private static final String SUPER_ADMIN_ROLE_CODE = "admin";

    /** Portal 哨兵系统：允许写入菜单归属，但不允许作为业务系统被授权。 */
    private static final String PORTAL_SENTINEL = "portal";

    private final JdbcTemplate jdbcTemplate;
    private final PermissionService permissionService;
    private final PermissionRevisionService revisionService;
    private final OperatorResolver operatorResolver;

    @Override
    public SystemAuthorizationVO read(String targetType, Long targetId, String systemCode) {
        validateTargetType(targetType);
        requireTargetExists(targetType, targetId);
        requireSystemExists(systemCode);
        boolean access = hasSystemAccessRow(targetType, targetId, systemCode);
        List<MenuPermissionDTO> perms = loadScopedPermissions(targetType, targetId, systemCode);
        SystemAuthorizationVO vo = new SystemAuthorizationVO();
        vo.setTargetType(targetType);
        vo.setTargetId(targetId);
        vo.setSystemCode(systemCode);
        vo.setSystemAccess(access);
        vo.setPermissions(perms);
        vo.setRevision(revisionService.currentRevision());
        return vo;
    }

    @Override
    @Transactional
    public SystemAuthorizationVO save(String targetType, Long targetId, String systemCode, SystemAuthorizationRequest request) {
        validateTargetType(targetType);
        requireTargetExists(targetType, targetId);
        requireSystemExists(systemCode);
        if (PORTAL_SENTINEL.equalsIgnoreCase(systemCode)) {
            throw new BusinessException("portal 是个人工作台哨兵，不能作为业务系统授权");
        }
        if (TARGET_ROLE.equals(targetType) && isSuperAdminRole(targetId)) {
            throw new BusinessException("内置 admin 角色不参与系统授权（后端已直通）");
        }
        if (request == null) {
            throw new BusinessException("授权请求不能为空");
        }
        // 乐观锁：客户端传了 expectedRevision 才校验；未传视为过渡期兼容
        long currentRevision = revisionService.currentRevision();
        if (request.getExpectedRevision() != null && request.getExpectedRevision() != currentRevision) {
            throw new BusinessException(ResultCode.CONFLICT.getCode(),
                    "权限已被他人修改，请刷新后重试（预期 revision=" + request.getExpectedRevision() + "，实际=" + currentRevision + "）");
        }
        // 菜单作用域：本次保存仅影响该系统内的菜单，其他系统授权不动
        Map<String, Long> menuKeyToId = loadSystemMenuKeyMap(systemCode);
        Set<Long> systemMenuIds = new HashSet<>(menuKeyToId.values());
        List<MenuPermissionDTO> normalized = normalizePermissions(request.getPermissions(), menuKeyToId, request.isSystemAccess());

        if (request.isSystemAccess()) {
            grantSystemAccess(targetType, targetId, systemCode);
        } else {
            revokeSystemAccess(targetType, targetId, systemCode);
        }
        overwriteScopedMenuPermissions(targetType, targetId, systemMenuIds, normalized);

        // evictAll 内部完成本实例 cache 清空 + 全局 revision bump；事务回滚时 bump 也回滚
        permissionService.evictAll();

        SystemAuthorizationVO vo = new SystemAuthorizationVO();
        vo.setTargetType(targetType);
        vo.setTargetId(targetId);
        vo.setSystemCode(systemCode);
        vo.setSystemAccess(request.isSystemAccess());
        vo.setPermissions(normalized);
        vo.setRevision(revisionService.currentRevision());
        log.info("系统授权已保存: targetType={}, targetId={}, systemCode={}, access={}, menuCount={}, operator={}",
                targetType, targetId, systemCode, request.isSystemAccess(), normalized.size(),
                operatorResolver.currentOperatorName());
        return vo;
    }

    // ────────────────────────────────────────────────────────────────
    //  私有：目标 / 系统 校验
    // ────────────────────────────────────────────────────────────────
    private void validateTargetType(String targetType) {
        if (!TARGET_ROLE.equals(targetType) && !TARGET_DEPARTMENT.equals(targetType)) {
            throw new BusinessException("不支持的授权目标类型: " + targetType);
        }
    }

    private void requireTargetExists(String targetType, Long targetId) {
        if (targetId == null) {
            throw new BusinessException("授权目标 ID 不能为空");
        }
        String sql = TARGET_ROLE.equals(targetType)
                ? "SELECT COUNT(*) FROM sys_role WHERE id = ? AND deleted = 0"
                : "SELECT COUNT(*) FROM sys_department WHERE id = ? AND deleted = 0";
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, targetId);
        if (count == null || count == 0) {
            throw new BusinessException("授权目标不存在: " + targetType + "#" + targetId);
        }
    }

    private void requireSystemExists(String systemCode) {
        if (!StringUtils.hasText(systemCode)) {
            throw new BusinessException("系统编码不能为空");
        }
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_system WHERE code = ? AND deleted = 0",
                Integer.class, systemCode);
        if (count == null || count == 0) {
            throw new BusinessException("系统不存在: " + systemCode);
        }
    }

    private boolean isSuperAdminRole(Long roleId) {
        String code = jdbcTemplate.queryForObject(
                "SELECT code FROM sys_role WHERE id = ? AND deleted = 0", String.class, roleId);
        return SUPER_ADMIN_ROLE_CODE.equalsIgnoreCase(code);
    }

    // ────────────────────────────────────────────────────────────────
    //  私有：读
    // ────────────────────────────────────────────────────────────────
    private boolean hasSystemAccessRow(String targetType, Long targetId, String systemCode) {
        String sql = TARGET_ROLE.equals(targetType)
                ? "SELECT COUNT(*) FROM sys_role_system WHERE role_id = ? AND system_code = ?"
                : "SELECT COUNT(*) FROM sys_department_system WHERE dept_id = ? AND system_code = ?";
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, targetId, systemCode);
        return count != null && count > 0;
    }

    /** 读取目标在该系统内已授权的菜单；未授权时返回空列表；actions 为空视为 view（与 PermissionServiceImpl 语义一致）。 */
    private List<MenuPermissionDTO> loadScopedPermissions(String targetType, Long targetId, String systemCode) {
        String sql = TARGET_ROLE.equals(targetType)
                ? "SELECT m.menu_key, rm.actions FROM sys_role_menu rm "
                + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 "
                + "WHERE rm.role_id = ? AND m.system_code = ?"
                : "SELECT m.menu_key, dm.actions FROM sys_department_menu dm "
                + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 "
                + "WHERE dm.dept_id = ? AND m.system_code = ?";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, targetId, systemCode);
        List<MenuPermissionDTO> result = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            List<String> actions = JsonUtils.parseStringList((String) row.get("actions"));
            if (actions.isEmpty()) {
                actions = List.of("view");
            }
            dto.setActions(actions);
            result.add(dto);
        }
        return result;
    }

    /** 该系统下的 menuKey → menuId 映射（仅启用菜单，供写入校验作用域）。 */
    private Map<String, Long> loadSystemMenuKeyMap(String systemCode) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, menu_key FROM sys_menu WHERE system_code = ? AND deleted = 0",
                systemCode);
        Map<String, Long> map = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Number id = (Number) row.get("id");
            String key = (String) row.get("menu_key");
            if (id != null && key != null) {
                map.put(key, id.longValue());
            }
        }
        return map;
    }

    // ────────────────────────────────────────────────────────────────
    //  私有：写
    // ────────────────────────────────────────────────────────────────
    private void grantSystemAccess(String targetType, Long targetId, String systemCode) {
        String sql = TARGET_ROLE.equals(targetType)
                ? "INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)"
                : "INSERT IGNORE INTO sys_department_system (dept_id, system_code) VALUES (?, ?)";
        jdbcTemplate.update(sql, targetId, systemCode);
    }

    private void revokeSystemAccess(String targetType, Long targetId, String systemCode) {
        String sql = TARGET_ROLE.equals(targetType)
                ? "DELETE FROM sys_role_system WHERE role_id = ? AND system_code = ?"
                : "DELETE FROM sys_department_system WHERE dept_id = ? AND system_code = ?";
        jdbcTemplate.update(sql, targetId, systemCode);
    }

    /** 只覆盖目标在指定系统内的菜单授权，其他系统的记录保持不动。 */
    private void overwriteScopedMenuPermissions(String targetType, Long targetId, Set<Long> systemMenuIds,
                                                List<MenuPermissionDTO> permissions) {
        if (systemMenuIds.isEmpty()) {
            return;
        }
        String placeholders = String.join(",", Collections.nCopies(systemMenuIds.size(), "?"));
        List<Object> deleteArgs = new ArrayList<>();
        deleteArgs.add(targetId);
        deleteArgs.addAll(systemMenuIds);
        String deleteSql = TARGET_ROLE.equals(targetType)
                ? "DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN (" + placeholders + ")"
                : "DELETE FROM sys_department_menu WHERE dept_id = ? AND menu_id IN (" + placeholders + ")";
        jdbcTemplate.update(deleteSql, deleteArgs.toArray());

        if (permissions.isEmpty()) {
            return;
        }
        String insertSql = TARGET_ROLE.equals(targetType)
                ? "INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)"
                : "INSERT INTO sys_department_menu (dept_id, menu_id, actions) VALUES (?, ?, ?)";
        for (MenuPermissionDTO perm : permissions) {
            Long menuId = resolveMenuId(perm.getMenuKey(), systemMenuIds);
            if (menuId == null) {
                // normalizePermissions 已过滤，理论不到达；防御式跳过
                continue;
            }
            jdbcTemplate.update(insertSql, targetId, menuId, JsonUtils.toJson(perm.getActions()));
        }
    }

    /**
     * 归一化写入权限：
     * <ul>
     *   <li>systemAccess=false → 强制返回空（撤销系统时同时清除该系统菜单授权）；</li>
     *   <li>menuKey 不在本系统 → 抛错，避免越界污染其他系统授权；</li>
     *   <li>actions 空 → 视为未授权（本次改造收紧，不再默认 view）。</li>
     * </ul>
     */
    private List<MenuPermissionDTO> normalizePermissions(List<MenuPermissionDTO> input, Map<String, Long> menuKeyToId, boolean systemAccess) {
        if (!systemAccess || input == null || input.isEmpty()) {
            return List.of();
        }
        List<MenuPermissionDTO> normalized = new ArrayList<>(input.size());
        Set<String> seen = new HashSet<>();
        for (MenuPermissionDTO raw : input) {
            if (raw == null || !StringUtils.hasText(raw.getMenuKey())) {
                continue;
            }
            String key = raw.getMenuKey().trim();
            if (!menuKeyToId.containsKey(key)) {
                throw new BusinessException("菜单 " + key + " 不属于本系统，禁止跨系统授权");
            }
            if (!seen.add(key)) {
                throw new BusinessException("菜单 " + key + " 在同一请求中重复提交");
            }
            List<String> actions = raw.getActions() == null ? List.of() : raw.getActions().stream()
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .distinct()
                    .toList();
            if (actions.isEmpty()) {
                // 未选任何动作 = 未授权，跳过（不再默认 view）
                continue;
            }
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey(key);
            dto.setActions(actions);
            normalized.add(dto);
        }
        return normalized;
    }

    private Long resolveMenuId(String menuKey, Set<Long> scopeIds) {
        Long id = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                (rs, rowNum) -> rs.getLong("id"),
                menuKey);
        if (id == null || !scopeIds.contains(id)) {
            return null;
        }
        return id;
    }
}

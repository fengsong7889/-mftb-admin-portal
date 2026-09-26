package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 统一「授权中心」菜单初始化（权限中心重构 · 消除功能授权/系统授权双写冗余）。
 * <p>在 permission 顶级菜单下新增 {@code authorization-center} 叶子菜单（排第 1 位），
 * 合并旧「功能授權」({@code function-permission}) 与「系統授權」({@code system-authorization})
 * 两个页面的授权能力；旧菜单本迁移后停用（status=0，不物理删除，保留回滚能力）。
 * <p>幂等步骤：
 * <ol>
 *   <li>菜单 upsert（parent=permission, system_code=iam, actions=view/create/edit/delete）；</li>
 *   <li>把现有目标（角色/部门）对旧两个菜单的授权 union 合并复制到新菜单，
 *       保证旧页面使用人无缝获得新页面；</li>
 *   <li>为新菜单的持有者补齐 iam 系统准入（严格模式下 PermissionAspect 会按菜单反查系统校验）；</li>
 *   <li>为内置 admin 角色回填全量动作授权；</li>
 *   <li>旧菜单 status=0 停用。</li>
 * </ol>
 * 版本键 {@code iam:authz-center-menu:v1.0}；参考 SQL: {@code backend/sql/194_authz_center.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(22)
public class AuthzCenterMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "iam:authz-center-menu:v1.0";
    private static final String MENU_KEY = "authorization-center";
    private static final String PARENT_KEY = "permission";
    private static final String ADMIN_ROLE_CODE = "admin";
    /** 被合并下线的旧授权菜单（顺序执行本迁移前均可能持有授权记录） */
    private static final List<String> LEGACY_MENU_KEYS = List.of("function-permission", "system-authorization");
    private static final String MENU_ACTIONS_JSON = "[\"view\",\"create\",\"edit\",\"delete\"]";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        Long parentId = queryMenuIdByKey(PARENT_KEY);
        if (parentId == null) {
            throw new IllegalStateException("permission 顶级菜单不存在，无法挂载 " + MENU_KEY);
        }
        // 清理历史软删残留，避免唯一键冲突（幂等）
        jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", MENU_KEY);

        Long menuId = queryMenuIdByKey(MENU_KEY);
        if (menuId == null) {
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, 2, 0, ?, ?, 1, 'system', 0)",
                    parentId, MENU_KEY, "授權中心", "Authorization Center",
                    "/authorization-center", "AuthorizationCenter", "SafetyOutlined",
                    MENU_ACTIONS_JSON, SystemCode.IAM.code());
            menuId = queryMenuIdByKey(MENU_KEY);
        } else {
            // 已存在则对齐 parent / 系统归属 / 启停（名称允许菜单配置自定义，不覆盖）
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, system_code = ?, status = 1, deleted = 0 WHERE menu_key = ?",
                    parentId, SystemCode.IAM.code(), MENU_KEY);
        }
        if (menuId == null) {
            throw new IllegalStateException("授权中心菜单落地后仍查不到 menuKey=" + MENU_KEY);
        }

        // 旧菜单授权 union 合并 → 新菜单（角色通道）
        Set<Long> roleTargets = mergeLegacyGrants(
                "sys_role_menu", "role_id", menuId);
        for (Long roleId : roleTargets) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                    roleId, SystemCode.IAM.code());
        }
        // 旧菜单授权 union 合并 → 新菜单（部门通道）
        Set<Long> deptTargets = mergeLegacyGrants(
                "sys_department_menu", "dept_id", menuId);
        for (Long deptId : deptTargets) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_department_system (dept_id, system_code) VALUES (?, ?)",
                    deptId, SystemCode.IAM.code());
        }

        // 内置 admin 角色补齐全量动作（sys_user.role=admin 直通，但绑定 sys_admin 角色的员工依赖 sys_role_menu 记录）
        jdbcTemplate.update(
                "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                        + "SELECT r.id, ?, '" + MENU_ACTIONS_JSON + "' FROM sys_role r "
                        + "WHERE r.code = ? AND r.deleted = 0 "
                        + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                menuId, ADMIN_ROLE_CODE);

        // 停用旧入口菜单（不物理删除，保留回滚能力；授权记录因 m.status=1 join 自动失效）
        for (String legacy : LEGACY_MENU_KEYS) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET status = 0, updated_by = 'system' WHERE menu_key = ? AND deleted = 0",
                    legacy);
        }

        permissionService.evictAll();
        log.info("授权中心菜单已就绪: menuId={}, 角色迁移数={}, 部门迁移数={}, 旧菜单已停用={}",
                menuId, roleTargets.size(), deptTargets.size(), LEGACY_MENU_KEYS);
    }

    /**
     * 把目标对旧授权菜单的动作 union 合并写入新菜单授权。
     * <p>actions 为空按 view 处理（与 PermissionServiceImpl 读侧语义对齐）。
     *
     * @return 迁移涉及的目标 ID 集合（用于补系统准入）
     */
    private Set<Long> mergeLegacyGrants(String table, String targetColumn, Long newMenuId) {
        String placeholders = String.join(",", LEGACY_MENU_KEYS.stream().map(k -> "?").toList());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT rm." + targetColumn + " AS target_id, rm.actions "
                        + "FROM " + table + " rm "
                        + "JOIN sys_menu m ON rm.menu_id = m.id "
                        + "WHERE m.menu_key IN (" + placeholders + ")",
                LEGACY_MENU_KEYS.toArray());
        Map<Long, Set<String>> merged = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long targetId = ((Number) row.get("target_id")).longValue();
            List<String> actions = JsonUtils.parseStringList((String) row.get("actions"));
            Set<String> set = merged.computeIfAbsent(targetId, k -> new LinkedHashSet<>());
            if (actions.isEmpty()) {
                set.add("view");
            } else {
                set.addAll(actions);
            }
        }
        for (Map.Entry<Long, Set<String>> entry : merged.entrySet()) {
            List<String> finalActions = new java.util.ArrayList<>(entry.getValue());
            // 保证 view 始终在列（页面入口动作）
            if (!finalActions.contains("view")) {
                finalActions = new java.util.ArrayList<>(finalActions);
                finalActions.add("view");
            }
            jdbcTemplate.update(
                    "INSERT INTO " + table + " (" + targetColumn + ", menu_id, actions) VALUES (?, ?, ?) "
                            + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                    entry.getKey(), newMenuId, JsonUtils.toJson(finalActions));
        }
        return merged.keySet();
    }

    private void verifyMigration() {
        Long menuId = queryMenuIdByKey(MENU_KEY);
        if (menuId == null) {
            throw new IllegalStateException("授权中心菜单未落地: " + MENU_KEY);
        }
        Map<String, Object> row = jdbcTemplate.queryForList(
                "SELECT status, system_code FROM sys_menu WHERE id = ?", menuId)
                .stream().findFirst().orElse(null);
        if (row == null || ((Number) row.get("status")).intValue() != 1) {
            throw new IllegalStateException("授权中心菜单未处于启用状态");
        }
        if (!SystemCode.IAM.code().equalsIgnoreCase((String) row.get("system_code"))) {
            throw new IllegalStateException("授权中心菜单归属未正确写入: 期望 iam, 实际 " + row.get("system_code"));
        }
        // admin 角色必须持有新菜单（否则 sys_admin 绑定用户看不到入口）
        Integer adminGrant = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm "
                        + "JOIN sys_role r ON rm.role_id = r.id AND r.code = ? AND r.deleted = 0 "
                        + "WHERE rm.menu_id = ?",
                Integer.class, ADMIN_ROLE_CODE, menuId);
        if (adminGrant == null || adminGrant == 0) {
            throw new IllegalStateException("admin 角色未回填授权中心菜单授权");
        }
        // 旧菜单必须已停用（行可以不存在——全新库由种子保证存在）
        for (String legacy : LEGACY_MENU_KEYS) {
            Integer active = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1",
                    Integer.class, legacy);
            if (active != null && active > 0) {
                throw new IllegalStateException("旧授权菜单未停用: " + legacy);
            }
        }
    }

    private Long queryMenuIdByKey(String key) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, key);
        return ids.isEmpty() ? null : ids.get(0);
    }
}

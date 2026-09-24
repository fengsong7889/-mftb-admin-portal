package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 权限中心 "系统授权" 菜单初始化（Round 4）。
 * <p>在 permission 顶级菜单下新增 {@code system-authorization} 叶子菜单，
 * 供前端 {@code /system-authorization} 路由挂载；系统归属 {@code iam}（权限中心），
 * 与既有 {@code role-management / function-permission / data-permission} 同级。
 * <p>遵循项目规范：
 * <ul>
 *   <li>{@code applyOnce} 双阶校验（版本键 {@code iam:system-authz-menu:v1.0}）；</li>
 *   <li>菜单落地后调 {@link PermissionService#evictAll()} 递增 revision，
 *       保证跨实例的 hasPermission 缓存立即看到新菜单；</li>
 *   <li>为内置 admin 角色补授权（{@code sys_user.role=admin} 后端直通，但 {@code sys_admin} 角色用户
 *       需要在 sys_role_menu 中显式持有 view/edit 才可见）。</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(17)
public class SystemAuthorizationMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "iam:system-authz-menu:v1.0";
    private static final String MENU_KEY = "system-authorization";
    private static final String PARENT_KEY = "permission";
    private static final String ADMIN_ROLE_CODE = "admin";

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

        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, MENU_KEY);
        if (exists != null && exists > 0) {
            // 已存在则仅对齐 parent_id + system_code + status（名称允许用户在菜单配置里自定义，不覆盖）
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, system_code = ?, status = 1, deleted = 0 WHERE menu_key = ?",
                    parentId, SystemCode.IAM.code(), MENU_KEY);
        } else {
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, 2, 4, ?, ?, 1, 'system', 0)",
                    parentId, MENU_KEY, "系統授權", "System Authorization",
                    "/system-authorization", "SystemAuthorization", "SafetyCertificateOutlined",
                    "[\"view\",\"edit\"]", SystemCode.IAM.code());
        }
        Long menuId = queryMenuIdByKey(MENU_KEY);
        if (menuId == null) {
            throw new IllegalStateException("系统授权菜单落地后仍查不到 menuKey=" + MENU_KEY);
        }
        // 为内置 admin 角色补授权：sys_user.role=admin 直通，但绑定 sys_admin 角色的员工依赖 sys_role_menu 记录
        jdbcTemplate.update(
                "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                        + "SELECT r.id, ?, '[\"view\",\"edit\"]' FROM sys_role r "
                        + "WHERE r.code = ? AND r.deleted = 0 "
                        + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                menuId, ADMIN_ROLE_CODE);
        // 菜单变化影响跨实例权限缓存，统一递增 revision
        permissionService.evictAll();
        log.info("系统授权菜单已就绪: parent={}, system={}", PARENT_KEY, SystemCode.IAM.code());
    }

    private void verifyMigration() {
        Long menuId = queryMenuIdByKey(MENU_KEY);
        if (menuId == null) {
            throw new IllegalStateException("系统授权菜单未落地: " + MENU_KEY);
        }
        String systemCode = jdbcTemplate.queryForObject(
                "SELECT system_code FROM sys_menu WHERE id = ?", String.class, menuId);
        if (!SystemCode.IAM.code().equalsIgnoreCase(systemCode)) {
            throw new IllegalStateException("系统授权菜单归属未正确写入: 期望 iam, 实际 " + systemCode);
        }
    }

    private Long queryMenuIdByKey(String key) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                (rs, rowNum) -> rs.getLong("id"),
                key);
    }
}

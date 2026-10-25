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
 * 「人員主檔」菜單初始化（C3 花名册入口）。
 * <p>
 * 归属人事管理（hr），但使用全新 menu_key {@code hcm-person}：
 * 旧「員工管理」仍以 sys_user 为事实源，新主档以 person 为事实源，两者在 C6 切换前并存，
 * 写权不能混在一个菜单里，否则权限中心的授权边界说不清。
 * <p>
 * 只种一个菜单，不种雇佣/任职子页：它是详情页内的维护动作，不是独立导航项。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(27)
public class HcmPersonMenuInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:person-menu:v1.0";

    private static final String SYSTEM_CODE = SystemCode.HR.code();
    private static final String ADMIN_ROLE_CODE = "admin";
    private static final String MENU_KEY = "hcm-person";
    private static final String ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\"]";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
    }

    private void migrate() {
        Long id = queryMenuId(MENU_KEY);
        if (id == null) {
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", MENU_KEY);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (NULL, ?, ?, ?, ?, ?, ?, 2, ?, ?, 1, ?, 'system', 0)",
                    MENU_KEY, "人員主檔", "Person Master", "/hcm-person", "HcmPersonList",
                    "IdcardOutlined", 62, ACTIONS, SYSTEM_CODE);
            log.info("已創建人員主檔菜單: {} (system_code={})", MENU_KEY, SYSTEM_CODE);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET path = ?, component = ?, icon = ?, system_code = ?, "
                            + "status = 1, deleted = 0, updated_by = 'system' WHERE id = ?",
                    "/hcm-person", "HcmPersonList", "IdcardOutlined", SYSTEM_CODE, id);
        }
        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
    }

    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        Long menuId = queryMenuId(MENU_KEY);
        if (adminRoleId == null || menuId == null) {
            log.warn("admin 角色或人員主檔菜單不存在，跳過授權");
            return;
        }
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                adminRoleId, menuId, ACTIONS);
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                ACTIONS, adminRoleId, menuId);
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                adminRoleId, SYSTEM_CODE);
    }

    /** 按菜单授权反推 hr 系统准入，避免持菜单授权却缺系统准入的普通角色被拦成 403 */
    private void deriveSystemAccess() {
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT DISTINCT rm.role_id, ? FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = ? "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1 "
                        + "WHERE r.code <> ?",
                SYSTEM_CODE, SYSTEM_CODE, ADMIN_ROLE_CODE);
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_department_system (dept_id, system_code) "
                        + "SELECT DISTINCT dm.dept_id, ? FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = ?",
                SYSTEM_CODE, SYSTEM_CODE);
    }

    private void verify() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                        + "AND system_code = ? AND path IS NOT NULL",
                Integer.class, MENU_KEY, SYSTEM_CODE);
        if (count == null || count == 0) {
            throw new IllegalStateException("人員主檔菜單未就緒: " + MENU_KEY);
        }
    }

    private Long queryMenuId(String menuKey) {
        var ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long queryAdminRoleId() {
        var ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = ? AND deleted = 0 LIMIT 1", Long.class, ADMIN_ROLE_CODE);
        return ids.isEmpty() ? null : ids.get(0);
    }
}

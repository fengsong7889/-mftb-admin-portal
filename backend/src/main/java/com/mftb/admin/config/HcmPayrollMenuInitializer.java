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
 * 薪酬福利系統（payroll）菜單初始化：薪酬項目 / 薪酬標準。
 * <p>
 * 為什麼不復用 hr 的菜單 key：薪酬是獨立責任域，復用即讓「看人事檔案」的人自動獲得看全員工資的授權。
 * 只種兩個真實頁面；核算批次與工資單（D3）落地時再追加，不先種空殼。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(28)
public class HcmPayrollMenuInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:payroll-menu:v1.0";

    private static final String SYSTEM_CODE = SystemCode.PAYROLL.code();
    private static final String ADMIN_ROLE_CODE = "admin";
    private static final String ACTIONS_FULL = "[\"view\",\"create\",\"edit\",\"delete\"]";

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
        Long nullParent = null;
        ensureMenu(nullParent, "hcm-payroll-component", "薪資項目", "/hcm-payroll-component",
                "HcmPayrollComponentList", "MoneyCollectOutlined", 71, "Payroll Components");
        ensureMenu(nullParent, "hcm-payroll-standard", "薪酬標準", "/hcm-payroll-standard",
                "HcmPayrollStandardList", "WalletOutlined", 72, "Salary Standards");
        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("薪酬福利系統菜單已就緒: 2 條, system_code={}", SYSTEM_CODE);
    }

    private void ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String nameEn) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?, 1, ?, 'system', 0)",
                    parentId, menuKey, name, nameEn, path, component, icon, sortOrder, ACTIONS_FULL, SYSTEM_CODE);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET path = ?, component = ?, icon = ?, system_code = ?, "
                            + "status = 1, deleted = 0, updated_by = 'system' WHERE id = ?",
                    path, component, icon, SYSTEM_CODE, id);
        }
    }

    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳過薪酬菜單授權");
            return;
        }
        for (String key : new String[]{"hcm-payroll-component", "hcm-payroll-standard"}) {
            Long menuId = queryMenuId(key);
            if (menuId == null) {
                throw new IllegalStateException("薪酬菜單落地後仍查不到: " + key);
            }
            jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                    adminRoleId, menuId, ACTIONS_FULL);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                            + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                    ACTIONS_FULL, adminRoleId, menuId);
        }
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                adminRoleId, SYSTEM_CODE);
    }

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
        for (String key : new String[]{"hcm-payroll-component", "hcm-payroll-standard"}) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND path IS NOT NULL",
                    Integer.class, key, SYSTEM_CODE);
            if (count == null || count == 0) {
                throw new IllegalStateException("薪酬菜單未就緒: " + key);
            }
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

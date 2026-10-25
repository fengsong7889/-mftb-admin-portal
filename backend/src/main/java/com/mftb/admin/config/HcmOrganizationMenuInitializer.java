package com.mftb.admin.config;

import com.mftb.admin.constant.HcmOrganizationConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 組織編制系統（organization）菜單初始化。
 * <p>
 * 本批只種兩個真實頁面：法人主體、管理組織。職位體系與工作量（崗位/編制）在後續批次落地時
 * 再追加菜單——不先種空殼菜單，避免側邊欄出現點進去 404 的幽靈入口。
 * <p>
 * 關鍵約束：
 * <ul>
 *   <li>{@code system_code} 必須顯式寫 {@code organization}，且<b>不得</b>復用 {@code hr} 的菜單 key；
 *       舊 hr 准入不能自動擴成新系統權限（方案 13.5 第 6 步）。</li>
 *   <li>admin 授權用 {@code INSERT IGNORE} + 只補空動作集，不覆蓋授權中心裡被收窄過的動作。</li>
 *   <li>按菜單授權反推角色/部門的系統准入，避免普通角色上線當天被 {@code PermissionAspect} 攔成 403。</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(26)
public class HcmOrganizationMenuInitializer implements CommandLineRunner {

    /** 供隔離庫用例引用 */
    static final String VERSION_KEY = "hcm:org-menu:v1.0";

    /** 第二批：職位體系兩個菜單（職務族 / 職位職級） */
    static final String VERSION_KEY_JOB = "hcm:org-menu:v1.1";

    /** 第三批：崗位與編制菜單 */
    static final String VERSION_KEY_POSITION = "hcm:org-menu:v1.2";

    private static final String SYSTEM_CODE = SystemCode.ORGANIZATION.code();
    private static final String ADMIN_ROLE_CODE = "admin";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        // 已记版本时仍重放：生产库被回滚或菜单被手工删行时，启动要能把入口自愈回来
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
        if (!versionTracker.applyOnce(VERSION_KEY_JOB, this::migrateJobMenus, this::verifyJobMenus)) {
            migrateJobMenus();
        }
        if (!versionTracker.applyOnce(VERSION_KEY_POSITION, this::migratePositionMenu, this::verifyPositionMenu)) {
            migratePositionMenu();
        }
    }

    /** 崗位與編制菜單 */
    private void migratePositionMenu() {
        ensureMenu(null, "hcm-org-position", "崗位與編制", "/hcm-org-position",
                "HcmOrgPositionList", "LayoutOutlined", 70,
                HcmOrganizationConstants.ACTIONS_FULL, "Positions & Headcount");
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId != null) {
            upsertGrant(adminRoleId, HcmOrganizationConstants.MENU_POSITION);
        }
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("組織編制-崗位與編制菜單已就緒, system_code={}", SYSTEM_CODE);
    }

    private void verifyPositionMenu() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                        + "AND system_code = ? AND path IS NOT NULL",
                Integer.class, HcmOrganizationConstants.MENU_POSITION, SYSTEM_CODE);
        if (count == null || count == 0) {
            throw new IllegalStateException("崗位與編制菜單未就緒: " + HcmOrganizationConstants.MENU_POSITION);
        }
    }

    /** 職位體系菜單：只种植两个真实页面，岗位/编制在下一批登记 */
    private void migrateJobMenus() {
        Long nullParent = null;
        ensureMenu(nullParent, "hcm-org-job-family", "職務族", "/hcm-org-job-family",
                "HcmOrgJobFamilyList", "ClusterOutlined", 68,
                HcmOrganizationConstants.ACTIONS_FULL, "Job Families");
        ensureMenu(nullParent, "hcm-org-job-grade", "職位職級", "/hcm-org-job-grade",
                "HcmOrgJobGradeList", "TagsOutlined", 69,
                HcmOrganizationConstants.ACTIONS_FULL, "Job Grades");
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId != null) {
            upsertGrant(adminRoleId, HcmOrganizationConstants.MENU_JOB_FAMILY);
            upsertGrant(adminRoleId, HcmOrganizationConstants.MENU_JOB_GRADE);
        }
        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("組織編制-職位體系菜單已就緒: 2 條, system_code={}", SYSTEM_CODE);
    }

    private void verifyJobMenus() {
        for (String menuKey : new String[]{HcmOrganizationConstants.MENU_JOB_FAMILY, HcmOrganizationConstants.MENU_JOB_GRADE}) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND path IS NOT NULL",
                    Integer.class, menuKey, SYSTEM_CODE);
            if (count == null || count == 0) {
                throw new IllegalStateException("職位體系菜單未就緒: " + menuKey);
            }
        }
    }

    private void migrate() {
        // 菜单 key 用字面量而不是常量：scripts/check-menu-consistency.mjs 按源码里的
        // ensureMenu(..., "key", "名称", "/path", "Component", "Icon", ...) 字面量形态解析域菜单
        Long nullParent = null;
        ensureMenu(nullParent, "hcm-org-legal", "法人主體", "/hcm-org-legal",
                "HcmOrgLegalEntityList", "BankOutlined", 66,
                HcmOrganizationConstants.ACTIONS_FULL, "Legal Entities");
        ensureMenu(nullParent, "hcm-org-unit", "管理組織", "/hcm-org-unit",
                "HcmOrgUnitList", "ApartmentOutlined", 67,
                HcmOrganizationConstants.ACTIONS_FULL, "Organization Units");

        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("組織編制系統菜單已就緒: 2 條, system_code={}", SYSTEM_CODE);
    }

    /** 新增或对齐叶子菜单；名称留给「菜单配置」自定义，英文名只在为空时补齐 */
    private void ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions, String nameEn) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            // 同 key 的逻辑删除行会占住唯一键，先物理清理软删残留再插入
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?, 1, ?, 'system', 0)",
                    parentId, menuKey, name, nameEn, path, component, icon, sortOrder, actions, SYSTEM_CODE);
            log.info("已創建組織編制菜單: {} ({})", name, menuKey);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET path = ?, component = ?, icon = ?, system_code = ?, "
                            + "status = 1, deleted = 0, updated_by = 'system' WHERE id = ?",
                    path, component, icon, SYSTEM_CODE, id);
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                    nameEn, id);
        }
    }

    /** admin 授權；只对空动作集补默认值，不覆盖授权中心主动收窄过的动作 */
    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳過組織編制菜單授權");
            return;
        }
        upsertGrant(adminRoleId, HcmOrganizationConstants.MENU_LEGAL_ENTITY);
        upsertGrant(adminRoleId, HcmOrganizationConstants.MENU_UNIT);
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                adminRoleId, SYSTEM_CODE);
    }

    private void upsertGrant(Long roleId, String menuKey) {
        Long menuId = queryMenuId(menuKey);
        if (menuId == null) {
            throw new IllegalStateException("菜單落地後仍查不到 menu_key=" + menuKey);
        }
        String actions = HcmOrganizationConstants.ACTIONS_FULL;
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    /** 按菜单授权反推系统准入，普通角色/部门不必再手工补 organization 准入 */
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

    /** 后置校验：两条菜单存在、启用、归属本系统，且 admin 有授权 */
    private void verify() {
        for (String menuKey : new String[]{HcmOrganizationConstants.MENU_LEGAL_ENTITY, HcmOrganizationConstants.MENU_UNIT}) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND path IS NOT NULL",
                    Integer.class, menuKey, SYSTEM_CODE);
            if (count == null || count == 0) {
                throw new IllegalStateException("組織編制菜單未就緒: " + menuKey);
            }
            Long menuId = queryMenuId(menuKey);
            Long adminRoleId = queryAdminRoleId();
            if (menuId != null && adminRoleId != null) {
                Integer granted = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_role_menu WHERE role_id = ? AND menu_id = ?",
                        Integer.class, adminRoleId, menuId);
                if (granted == null || granted == 0) {
                    throw new IllegalStateException("admin 未獲組織編制菜單授權: " + menuKey);
                }
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

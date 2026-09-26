package com.mftb.admin.config;

import com.mftb.admin.constant.HrEssConstants;
import com.mftb.admin.service.PermissionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 員工自助（ESS）菜单初始化器（P1 第一块）：
 * <p>
 * {@code hr:ess-menu:v1.1} —— 新建一级菜单域 ess-center「員工自助」与其下三个叶子
 * （v1.0 已在开发库执行但缺「角色系统准入」与正确排序，故按规范递增版本重跑；
 *  全流程幂等，可安全重复执行）
 * ess-leave(我的假期) / ess-requests(我的申請單據) / ess-profile(我的檔案)；
 * admin 授全量动作，内置角色 employee_self_service(員工自助) 授本人视角动作。
 * <p>
 * 遵循迁移治理：{@code applyOnce(versionKey, task, verify)}，建菜单与后置校验都成功才记版本，
 * 失败不吞异常（写失败审计后下次启动重试）。排序/图标/英文名由 DataInitializer
 * {@code reconcileMenuMasterData} 每次启动自愈（applyOnce 记版本后不再重跑）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrEssSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_MENU = "hr:ess-menu:v1.1";

    /**
     * 一级域排序：紧跟 org-center(10) 之后。菜单迁移与 DataInitializer 的
     * applyTopLevelMenuSort 在同一次启动内先后顺序不确定，故此处直接落正确值，
     * 不依赖下一次启动才修正排序（否则新库首启会把 ESS 排到末尾）。
     */
    private static final int DOMAIN_SORT = 11;

    /** 员工自助角色编码（系统内置，与 DataInitializer 角色种子一致） */
    private static final String ESS_ROLE_CODE = "employee_self_service";

    /** {menuKey, 名称, 图标, 英文名, 层级: 1=一级域 / 2=叶子} */
    private static final String[][] MENUS = {
            {HrEssConstants.MENU_DOMAIN, "員工自助", "UserSwitchOutlined", "Employee Self-Service", "1"},
            {HrEssConstants.MENU_LEAVE, "我的假期", "FieldTimeOutlined", "My Leave", "2"},
            {HrEssConstants.MENU_REQUESTS, "我的申請單據", "FormOutlined", "My Requests", "2"},
            {HrEssConstants.MENU_PROFILE, "我的檔案", "FolderOpenOutlined", "My Profile", "2"},
    };

    /** 叶子菜单 → 员工自助角色的授权动作：本人视角可自助提单与撤回自己的草稿，单据与档案只读 */
    private static final String ESS_LEAVE_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\"]";
    private static final String ESS_READONLY_ACTIONS = "[\"view\"]";
    private static final String ADMIN_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_MENU, this::migrateMenus, this::verifyMenus);
        } catch (Exception e) {
            log.error("HR 員工自助菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    private void migrateMenus() {
        // 一级域必须与 hr 同门户系统域，否则门户 HR 导航剪枝会把整棵 ESS 树丢掉
        String systemCode = jdbcTemplate.queryForList(
                        "SELECT system_code FROM sys_menu WHERE menu_key = 'hr' AND deleted = 0 LIMIT 1",
                        String.class)
                .stream().findFirst().orElse("hr");

        Long domainId = upsertMenu(null, HrEssConstants.MENU_DOMAIN, 1, systemCode, DOMAIN_SORT);
        if (domainId == null) {
            throw new IllegalStateException("一级菜单 ess-center 创建失败");
        }
        int leafSort = 1;
        for (String[] m : MENUS) {
            if ("2".equals(m[4])) {
                if (upsertMenu(domainId, m[0], 2, systemCode, leafSort++) == null) {
                    throw new IllegalStateException("ESS 叶子菜单创建失败: " + m[0]);
                }
            }
        }

        grantRole(ESS_ROLE_CODE);
        grantRole("admin");
        // 系统准入与菜单授权是两条线（见 PermissionServiceImpl 权限缓存）：ESS 沿用 hr 系统域，
        // 必须同时给自助角色补 hr 系统准入，否则员工在门户里根本看不到「員工自助」入口。
        grantSystemAccess(ESS_ROLE_CODE, systemCode);
        permissionService.evictAll();
    }

    /** 建菜单（已存在则校正父级/类型/门户域/排序），返回 menu id */
    private Long upsertMenu(Long parentId, String menuKey, int type, String systemCode, int sort) {
        String name = nameOf(menuKey);
        Long id = queryMenuId(menuKey);
        if (id == null) {
            // 同名软删记录会占住唯一键，先物理清理再插入（与既有菜单迁移一致）
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted, system_code) "
                            + "VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)",
                    parentId, menuKey, name, iconOf(menuKey), type, sort, systemCode);
            id = queryMenuId(menuKey);
            log.info("已創建 ESS 菜單: {} ({})", menuKey, name);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, type = ?, system_code = ?, sort_order = ? "
                            + "WHERE id = ? AND deleted = 0",
                    parentId, type, systemCode, sort, id);
        }
        if (id != null) {
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                    nameEnOf(menuKey), id);
        }
        return id;
    }

    /**
     * 角色授权：一级域只需可见，叶子按「自助提单」与「只读」区分；admin 全量。
     * 不用 INSERT...SELECT + ON DUPLICATE（同名列在 MySQL 8 会报 1052 歧义），拆两步幂等。
     */
    private void grantRole(String roleCode) {
        Long roleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? LIMIT 1", Long.class, roleCode)
                .stream().findFirst().orElse(null);
        if (roleId == null) {
            log.warn("角色 {} 不存在，跳过 ESS 授权", roleCode);
            return;
        }
        boolean isAdmin = "admin".equals(roleCode);
        for (String[] m : MENUS) {
            String actions = isAdmin ? ADMIN_ACTIONS
                    : "1".equals(m[4]) ? ESS_READONLY_ACTIONS
                    : HrEssConstants.MENU_LEAVE.equals(m[0]) ? ESS_LEAVE_ACTIONS : ESS_READONLY_ACTIONS;
            Long menuId = queryMenuId(m[0]);
            if (menuId == null) {
                continue;
            }
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                    roleId, menuId, actions);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                            + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                    actions, roleId, menuId);
        }
    }

    /** 角色系统准入（sys_role_system 复合主键，INSERT IGNORE 天然幂等） */
    private void grantSystemAccess(String roleCode, String systemCode) {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT r.id, ? FROM sys_role r WHERE r.code = ? AND r.deleted = 0",
                systemCode, roleCode);
        log.info("ESS 系统准入授权: role={}, system={}, 新增={}（0 表示已存在）", roleCode, systemCode, inserted);
    }

    private void verifyMenus() {
        for (String[] m : MENUS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, m[0]);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("ESS 菜單未就緒: " + m[0]);
            }
        }
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    private static String nameOf(String menuKey) {
        return find(menuKey)[1];
    }

    private static String iconOf(String menuKey) {
        return find(menuKey)[2];
    }

    private static String nameEnOf(String menuKey) {
        return find(menuKey)[3];
    }

    private static String[] find(String menuKey) {
        for (String[] m : MENUS) {
            if (m[0].equals(menuKey)) {
                return m;
            }
        }
        throw new IllegalStateException("未登记的 ESS 菜单: " + menuKey);
    }
}

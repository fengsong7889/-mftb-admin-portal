package com.mftb.admin.config;

import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 考勤假勤系统（attendance）菜单与系统准入初始化。
 * <p>
 * 做三件事：
 * <ol>
 *   <li>把 10 个业务菜单种为顶级菜单，{@code system_code=attendance}；</li>
 *   <li>把既有的「請假管理 / 假期額度」从人力资源系统的 {@code hr-profile} 分组整体迁入本系统
 *       —— 对齐北森/飞书「假勤一体化」的产品边界，避免请假与考勤分属两个系统后抵扣口径要跨系统对齐；</li>
 *   <li>补齐 admin 授权，并按菜单授权反推角色/部门系统准入，避免严管模式下 PermissionAspect 拦截。</li>
 * </ol>
 * <p>
 * 关键约束：
 * <ul>
 *   <li>{@code system_code} 必须显式写入。{@code SystemPortalSchemaInitializer.propagateSystemToDescendants}
 *       只在门户底座迁移那一次运行，晚于本初始化器插入的菜单若留 NULL，门户导航剪枝与系统准入会落到未定义行为。</li>
 *   <li>迁入的两个请假菜单只改 {@code parent_id / system_code / sort_order}，
 *       <b>不动 menu_key / path / actions</b>：授权行跟着菜单 id 走，改 key 等于让存量授权集体失效。</li>
 *   <li>排序与改名都带「当前值仍等于旧默认值」条件，管理员在「菜单配置」里自定义过的一律不动。</li>
 * </ul>
 * 幂等口径遵循后端 SQL 规范：条件化写入、失败抛出不吞异常，由
 * {@code applyOnce(versionKey, task, verify)} 保证「任务与校验都成功才记版本」；
 * 版本已应用时每次启动仍重放 upsert 自愈（防生产库被回滚或手工删行导致入口丢失）。
 * 参考 SQL：{@code backend/sql/228_attendance_system.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25)
public class AttendanceMenuInitializer implements CommandLineRunner {

    /** 供隔离库用例引用，避免测试里硬编码版本键 */
    static final String VERSION_KEY = "attendance:menu:v1.0";

    /**
     * v1.1：给「考勤日報」补上 {@code edit} 动作。
     * <p>为什么需要单独一个版本键：日报页的「重算區間日報」是写操作（重算会改日报、
     * 生成异常、回写打卡判定），而 v1.0 把日报当成纯只读菜单只给了 view/export。
     * {@code sys_menu.actions} 决定授权中心能勾出什么动作，缺 edit 就等于这个能力永远授不出去
     * （超管走代码直通看不出来，普通角色上线当天才暴露 403）。
     * <p>不能直接改 v1.0 的声明了事：{@code ensureMenu} 对已存在菜单只对齐结构不覆盖 actions，
     * 已落库的环境拿不到新动作集。
     */
    static final String VERSION_KEY_DAILY_ACTIONS = "attendance:menu:v1.1";

    private static final String SYSTEM_CODE = SystemCode.ATTENDANCE.code();
    private static final String ADMIN_ROLE_CODE = "admin";
    private static final int MENU_TYPE_LEAF = 2;

    /**
     * 菜单声明：{menuKey, 中文名, 英文名, path, component, icon, sort, actions}。
     * <p>顶级 sort 接在產研交付（16..25）之后取 26..37，请假两条占 33/34，
     * 顺序按「先看结论 → 再维护规则 → 再看数据 → 最后出口」的管理动线排列。
     * <p>图标全部取自当前 sys_menu 未使用的图标名，菜单图标必须全局唯一。
     */
    private static final String[][] MENUS = {
            {AttendanceConstants.MENU_WORKBENCH, "假勤工作台", "Attendance Workbench",
                    "/attendance-workbench", "AttendanceWorkbench", "ClockCircleOutlined", "26", AttendanceConstants.ACTIONS_VIEW},
            {AttendanceConstants.MENU_GROUP, "考勤組與規則", "Attendance Groups",
                    "/attendance-group", "AttendanceGroupList", "GroupOutlined", "27", AttendanceConstants.ACTIONS_FULL},
            {AttendanceConstants.MENU_SHIFT, "班次管理", "Shifts",
                    "/attendance-shift", "AttendanceShiftList", "RetweetOutlined", "28", AttendanceConstants.ACTIONS_FULL},
            {AttendanceConstants.MENU_HOLIDAY, "節假日日曆", "Holiday Calendar",
                    "/attendance-holiday", "AttendanceHolidayList", "SnippetsOutlined", "29", AttendanceConstants.ACTIONS_HOLIDAY},
            {AttendanceConstants.MENU_SCHEDULE, "排班管理", "Scheduling",
                    "/attendance-schedule", "AttendanceSchedule", "BorderOutlined", "30", AttendanceConstants.ACTIONS_VIEW_EDIT_IMPORT_EXPORT},
            {AttendanceConstants.MENU_PUNCH, "打卡記錄", "Punch Records",
                    "/attendance-punch", "AttendancePunchList", "ScanOutlined", "31", AttendanceConstants.ACTIONS_VIEW_IMPORT_EXPORT},
            {AttendanceConstants.MENU_EXCEPTION, "異常處理", "Attendance Exceptions",
                    "/attendance-exception", "AttendanceExceptionList", "ExclamationCircleOutlined", "32", AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT},
            {AttendanceConstants.MENU_DAILY, "考勤日報", "Daily Attendance",
                    "/attendance-daily", "AttendanceDailyReport", "AreaChartOutlined", "35", AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT},
            {AttendanceConstants.MENU_MONTHLY, "月度考勤匯總", "Monthly Attendance",
                    "/attendance-monthly", "AttendanceMonthlyReport", "PayCircleOutlined", "36", AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT},
            {AttendanceConstants.MENU_SETTING, "假勤設置", "Attendance Settings",
                    "/attendance-setting", "AttendanceSetting", "FunctionOutlined", "37", AttendanceConstants.ACTIONS_VIEW_EDIT},
    };

    /** 迁入菜单的目标排序：{menuKey, 新 sort, 旧默认 sort} */
    private static final String[][] MOVED_LEAVE_MENUS = {
            {AttendanceConstants.MENU_LEAVE, "33", "3"},
            {AttendanceConstants.MENU_LEAVE_QUOTA, "34", "4"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
        versionTracker.applyOnce(VERSION_KEY_DAILY_ACTIONS, this::alignDailyActions, this::verifyDailyActions);
    }

    /* ==================== 迁移任务 ==================== */

    private void migrate() {
        // 逐条显式调用且 menuKey 用字面量（不放进循环、不传常量）：
        // scripts/check-menu-consistency.mjs 以源码里的
        // ensureMenu(变量, "key", "名称", "/path", "Component", "Icon", ...) 字面量形态解析域菜单，
        // 写成循环或传 AttendanceConstants.MENU_* 常量会让这批新菜单落在主种子门禁盲区里
        // （与 VehicleSchemaMigrationInitializer 同法）。
        Long nullParent = null;
        ensureMenu(nullParent, "attendance-workbench", "假勤工作台", "/attendance-workbench",
                "AttendanceWorkbench", "ClockCircleOutlined", 26, AttendanceConstants.ACTIONS_VIEW,
                "Attendance Workbench");
        ensureMenu(nullParent, "attendance-group", "考勤組與規則", "/attendance-group",
                "AttendanceGroupList", "GroupOutlined", 27, AttendanceConstants.ACTIONS_FULL,
                "Attendance Groups");
        ensureMenu(nullParent, "attendance-shift", "班次管理", "/attendance-shift",
                "AttendanceShiftList", "RetweetOutlined", 28, AttendanceConstants.ACTIONS_FULL,
                "Shifts");
        ensureMenu(nullParent, "attendance-holiday", "節假日日曆", "/attendance-holiday",
                "AttendanceHolidayList", "SnippetsOutlined", 29, AttendanceConstants.ACTIONS_HOLIDAY,
                "Holiday Calendar");
        ensureMenu(nullParent, "attendance-schedule", "排班管理", "/attendance-schedule",
                "AttendanceSchedule", "BorderOutlined", 30, AttendanceConstants.ACTIONS_VIEW_EDIT_IMPORT_EXPORT,
                "Scheduling");
        ensureMenu(nullParent, "attendance-punch", "打卡記錄", "/attendance-punch",
                "AttendancePunchList", "ScanOutlined", 31, AttendanceConstants.ACTIONS_VIEW_IMPORT_EXPORT,
                "Punch Records");
        ensureMenu(nullParent, "attendance-exception", "異常處理", "/attendance-exception",
                "AttendanceExceptionList", "ExclamationCircleOutlined", 32, AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT,
                "Attendance Exceptions");
        ensureMenu(nullParent, "attendance-daily", "考勤日報", "/attendance-daily",
                "AttendanceDailyReport", "AreaChartOutlined", 35, AttendanceConstants.ACTIONS_VIEW_EXPORT,
                "Daily Attendance");
        ensureMenu(nullParent, "attendance-monthly", "月度考勤匯總", "/attendance-monthly",
                "AttendanceMonthlyReport", "PayCircleOutlined", 36, AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT,
                "Monthly Attendance");
        ensureMenu(nullParent, "attendance-setting", "假勤設置", "/attendance-setting",
                "AttendanceSetting", "FunctionOutlined", 37, AttendanceConstants.ACTIONS_VIEW_EDIT,
                "Attendance Settings");

        reparentLeaveMenus();
        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("考勤假勤系統菜單已就緒: 新建 {} 條 + 迁入 {} 條, system_code={}",
                MENUS.length, MOVED_LEAVE_MENUS.length, SYSTEM_CODE);
    }

    /**
     * 请假两个菜单从 {@code hr-profile} 分组迁入本系统顶级。
     * <p>WHERE 带「父级仍是 hr-profile」条件：如果管理员把它们挪去别处，说明是有意安排，
     * 启动重放不能反复把用户的调整顶回去；同时该条件也保证重复执行不产生新变更（幂等）。
     * <p>不清 sys_role_menu / sys_department_menu：菜单行 id 不变，授权天然随行。
     */
    private void reparentLeaveMenus() {
        Long legacyParentId = queryMenuId(AttendanceConstants.LEGACY_LEAVE_PARENT);
        if (legacyParentId == null) {
            log.info("父分组 {} 不存在，跳過請假菜單遷入（可能已完成遷移或分組已退役）", AttendanceConstants.LEGACY_LEAVE_PARENT);
            return;
        }
        for (String[] m : MOVED_LEAVE_MENUS) {
            String menuKey = m[0];
            Long menuId = queryMenuId(menuKey);
            if (menuId == null) {
                throw new IllegalStateException("請假菜單不存在，無法遷入考勤系統: " + menuKey);
            }
            int moved = jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = NULL, system_code = ?, updated_by = 'system' "
                            + "WHERE id = ? AND deleted = 0 AND parent_id = ?",
                    SYSTEM_CODE, menuId, legacyParentId);
            if (moved > 0) {
                log.info("菜單 {} 已從 {} 迁入考勤假勤系統頂級", menuKey, AttendanceConstants.LEGACY_LEAVE_PARENT);
            }
            // 排序只在当前值仍等于旧默认值时对齐，自定义过顺序的行不动
            jdbcTemplate.update(
                    "UPDATE sys_menu SET sort_order = ?, updated_by = 'system' "
                            + "WHERE id = ? AND deleted = 0 AND sort_order = ?",
                    Integer.parseInt(m[1]), menuId, Integer.parseInt(m[2]));
        }
    }

    /**
     * 新增或对齐叶子菜单。已存在时只对齐结构与归属，名称留给「菜单配置」自定义，
     * 英文名仅在为空时补齐（避免覆盖翻译工作台维护过的译文）。
     */
    private void ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions, String nameEn) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            // 同 key 的逻辑删除行会占住 uk_menu_key，先物理清理软删残留再插入
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'system', 0)",
                    parentId, menuKey, name, nameEn, path, component, icon,
                    MENU_TYPE_LEAF, sortOrder, actions, SYSTEM_CODE);
            log.info("已創建考勤假勤菜單: {} ({})", name, menuKey);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, path = ?, component = ?, icon = ?, system_code = ?, "
                            + "sort_order = ?, status = 1, deleted = 0, updated_by = 'system' WHERE id = ?",
                    parentId, path, component, icon, SYSTEM_CODE, sortOrder, id);
            jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                    nameEn, id);
        }
    }

    /**
     * admin 角色补齐全部考勤菜单授权。
     * <p>actions 必须非空：前端受控菜单在 actions 为空时会整项隐藏，超管也会看不到入口。
     * <p>分两步（INSERT IGNORE + 补空 UPDATE）而不是 INSERT...SELECT + ON DUPLICATE，
     * 后者在 MySQL 8 会因同名列报 1052 ambiguous。
     */
    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳過考勤假勤菜單授權");
            return;
        }
        for (String[] m : MENUS) {
            upsertGrant(adminRoleId, m[0], m[7]);
        }
        // 迁入的请假菜单原本就有 admin 授权，这里只补「历史上漏授」的情况，动作取菜单自身定义
        upsertGrant(adminRoleId, AttendanceConstants.MENU_LEAVE, AttendanceConstants.ACTIONS_VIEW_EDIT_IMPORT_EXPORT);
        upsertGrant(adminRoleId, AttendanceConstants.MENU_LEAVE_QUOTA, AttendanceConstants.ACTIONS_VIEW_EDIT);
    }

    private void upsertGrant(Long roleId, String menuKey, String actions) {
        Long menuId = queryMenuId(menuKey);
        if (menuId == null) {
            throw new IllegalStateException("菜單落地後仍查不到 menu_key=" + menuKey);
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        // 只对空动作补默认值；管理员在授权中心主动收窄过的动作集不得被启动重放扩权
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    /** 按菜单授权反推系统准入：已持有考勤菜单的角色/部门自动获得 attendance 准入，避免上线当天 403。 */
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

    /* ==================== v1.1：日报动作集补齐 ==================== */

    /**
     * 把「考勤日報」的可授动作集补齐到含 {@code edit}，并同步给 admin。
     * <p>只动这一个菜单：其余菜单的动作集在 v1.0 就是正确的，批量对齐会把管理员
     * 在授权中心主动收窄过的动作集扩回去（那属于静默扩权）。
     * <p>admin 是内置运维角色，重算日报是它必须能做的动作，因此显式扩权一次；
     * 其他角色的授权行完全不动，需要该能力的角色由管理员在授权中心自行勾选。
     */
    private void alignDailyActions() {
        String actions = dailyActions();
        jdbcTemplate.update(
                "UPDATE sys_menu SET actions = ?, updated_by = 'system' "
                        + "WHERE menu_key = ? AND deleted = 0 AND (actions IS NULL OR actions <> ?)",
                actions, AttendanceConstants.MENU_DAILY, actions);
        Long menuId = queryMenuId(AttendanceConstants.MENU_DAILY);
        Long adminRoleId = queryAdminRoleId();
        if (menuId == null || adminRoleId == null) {
            log.warn("日报菜单或 admin 角色不存在，跳過動作集授權對齊");
            return;
        }
        jdbcTemplate.update("UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ?",
                actions, adminRoleId, menuId);
        log.info("考勤日報菜單動作集已補齊 edit（重算日報屬寫操作）");
    }

    private void verifyDailyActions() {
        Integer wrong = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND (actions IS NULL OR actions <> ?)",
                Integer.class, AttendanceConstants.MENU_DAILY, dailyActions());
        if (wrong != null && wrong > 0) {
            throw new IllegalStateException("考勤日報菜單動作集未對齊，重算日報將無法授權: "
                    + AttendanceConstants.MENU_DAILY);
        }
    }

    /** 日报动作集的真值取自 MENUS 声明，避免同一串 JSON 在两处漂移 */
    private String dailyActions() {
        for (String[] m : MENUS) {
            if (AttendanceConstants.MENU_DAILY.equals(m[0])) {
                return m[7];
            }
        }
        throw new IllegalStateException("MENUS 声明缺少考勤日報: " + AttendanceConstants.MENU_DAILY);
    }

    /* ==================== 后置校验 ==================== */

    private void verify() {
        List<String> missing = new ArrayList<>();
        for (String[] m : MENUS) {
            Integer ok = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND parent_id IS NULL",
                    Integer.class, m[0], SYSTEM_CODE);
            if (ok == null || ok == 0) {
                missing.add(m[0]);
            }
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("考勤假勤菜單未就緒（缺失/归属/启用态/顶级不符）: " + missing);
        }
        for (String[] m : MOVED_LEAVE_MENUS) {
            Integer wrong = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 "
                            + "AND (system_code IS NULL OR system_code <> ? OR parent_id IS NOT NULL)",
                    Integer.class, m[0], SYSTEM_CODE);
            if (wrong != null && wrong > 0) {
                throw new IllegalStateException("請假菜單 " + m[0] + " 未完成迁入（仍挂在原父级或归属未改写）");
            }
        }
        Integer adminGrants = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = ? "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.system_code = ? AND m.deleted = 0",
                Integer.class, ADMIN_ROLE_CODE, SYSTEM_CODE);
        int expected = MENUS.length + MOVED_LEAVE_MENUS.length;
        if (adminGrants == null || adminGrants < expected) {
            throw new IllegalStateException("admin 角色未补齐考勤菜单授权: 实际 " + adminGrants + " 条，期望 >= " + expected);
        }
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    private Long queryAdminRoleId() {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? AND deleted = 0 LIMIT 1", Long.class, ADMIN_ROLE_CODE)
                .stream().findFirst().orElse(null);
    }
}

package com.mftb.admin.config;

import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.service.PermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 隔离内存库验证考勤假勤系统独立入口：顶级菜单落地、请假菜单跨系统迁入且授权随行、
 * 管理员自定义排序不被顶回去、准入按菜单授权反推、后置校验对缺菜单真的失败。
 */
class AttendanceMenuInitializerTest {

    private JdbcTemplate jdbc;
    private AttendanceMenuInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:attendance_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT AUTO_INCREMENT PRIMARY KEY, parent_id BIGINT, "
                + "menu_key VARCHAR(100) UNIQUE, name VARCHAR(100), name_en VARCHAR(100), path VARCHAR(200), "
                + "component VARCHAR(100), icon VARCHAR(100), type INT DEFAULT 2, sort_order INT DEFAULT 1, "
                + "actions VARCHAR(255), status INT DEFAULT 1, deleted INT DEFAULT 0, "
                + "system_code VARCHAR(32), updated_by VARCHAR(64))");
        // 人力资源系统现状：員工檔案分组下挂员工管理/请假管理/假期額度
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, path, type, sort_order, system_code) VALUES "
                + "(1, NULL, 'hr-profile', '員工檔案', NULL, 1, 1, 'hr'), "
                + "(2, 1, 'employee-management', '員工管理', '/employee-management', 2, 1, 'hr'), "
                + "(3, 1, 'hr-leave', '請假管理', '/hr-leave', 2, 3, 'hr'), "
                + "(4, 1, 'hr-leave-quota', '假期額度', '/hr-leave-quota', 2, 4, 'hr')");
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), deleted INT DEFAULT 0, status INT DEFAULT 1)");
        jdbc.execute("INSERT INTO sys_role VALUES (1, 'admin', 0, 1), (2, 'hr_staff', 0, 1)");
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (role_id, menu_id))");
        // hr_staff 原本只有请假单授权：迁入后应据此反推出 attendance 准入，且不因迁移丢授权
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, 3, '[\"view\",\"create\"]')");
        jdbc.execute("CREATE TABLE sys_department_menu (dept_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (dept_id, menu_id))");
        jdbc.execute("INSERT INTO sys_department_menu VALUES (7, 4, '[\"view\",\"edit\"]')");
        jdbc.execute("CREATE TABLE sys_role_system (role_id BIGINT, system_code VARCHAR(32), PRIMARY KEY (role_id, system_code))");
        jdbc.execute("CREATE TABLE sys_department_system (dept_id BIGINT, system_code VARCHAR(32), PRIMARY KEY (dept_id, system_code))");

        SchemaVersionTracker tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "attendance-menu-test");
        tracker.isApplied(AttendanceMenuInitializer.VERSION_KEY);
        initializer = new AttendanceMenuInitializer(jdbc, tracker, mock(PermissionService.class));
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrate");
    }

    private void groupMenus() {
        ReflectionTestUtils.invokeMethod(initializer, "groupMenus");
    }

    private void verifyV2() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyV2");
    }

    private Integer countTopAttendanceMenus() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE system_code = 'attendance' "
                + "AND deleted = 0 AND status = 1 AND parent_id IS NULL", Integer.class);
    }

    @Test
    void seedsTenTopLevelMenusAndGrantsAdminFullActions() {
        migrate();

        // 10 个业务菜单 + 迁入的 2 条请假菜单 = 12 条 attendance 顶级菜单
        assertEquals(12, countTopAttendanceMenus());
        Integer adminGrants = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = 'admin' "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.system_code = 'attendance'",
                Integer.class);
        assertNotNull(adminGrants);
        assertEquals(12, adminGrants.intValue());
        // 超管的请假菜单授权动作必须非空，否则前端受控菜单整项隐藏
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.code = 'admin' "
                        + "WHERE m.system_code = 'attendance' AND (rm.actions IS NULL OR rm.actions = '' OR rm.actions = '[]')",
                Integer.class));
        assertDoesNotThrowVerify();
    }

    @Test
    void moveLeaveMenusOutOfHrProfileWithoutBreakingExistingGrants() {
        migrate();

        for (String key : new String[]{AttendanceConstants.MENU_LEAVE, AttendanceConstants.MENU_LEAVE_QUOTA}) {
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? "
                    + "AND parent_id IS NOT NULL", Integer.class, key), key + " 仍挂在原父级下");
            assertEquals("attendance", jdbc.queryForObject(
                    "SELECT system_code FROM sys_menu WHERE menu_key = ?", String.class, key));
            // key 与 path 不变，菜单行 id 也不变——历史授权才不会失效
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND path IS NOT NULL",
                    Integer.class, key));
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'hr-leave' AND id = 3",
                Integer.class));
        assertEquals("[\"view\",\"create\"]", jdbc.queryForObject(
                "SELECT actions FROM sys_role_menu WHERE role_id = 2 AND menu_id = 3", String.class));
        // 部门对额度台账的授权同样随行，不因跨系统迁移而丢
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_menu WHERE dept_id = 7 AND menu_id = 4",
                Integer.class));
        // 员工管理仍属人力资源系统，没被整棵子树误伤
        assertEquals("hr", jdbc.queryForObject("SELECT system_code FROM sys_menu WHERE menu_key = 'employee-management'",
                String.class));
    }

    @Test
    void derivesAttendanceAccessFromMenuGrants() {
        migrate();

        // hr_staff 只持有请假单授权，请假菜单归入 attendance 后应反推得到系统准入
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE role_id = 2 AND system_code = 'attendance'",
                Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system WHERE dept_id = 7 AND system_code = 'attendance'",
                Integer.class));
    }

    @Test
    void keepsAdminCustomizedSortAndIsIdempotentOnRerun() {
        // 管理员把请假管理挪到了分组末尾
        jdbc.update("UPDATE sys_menu SET sort_order = 9 WHERE menu_key = 'hr-leave'");

        migrate();
        migrate();

        assertEquals(9, jdbc.queryForObject("SELECT sort_order FROM sys_menu WHERE menu_key = 'hr-leave'", Integer.class),
                "自定义排序不能被启动重放顶回去");
        // 重放两次仍是 12 条，且没有长出重复 key
        assertEquals(12, countTopAttendanceMenus());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM (SELECT menu_key FROM sys_menu "
                + "WHERE deleted = 0 GROUP BY menu_key HAVING COUNT(*) > 1) d", Integer.class));
    }

    @Test
    void verifyFailsWhenASeedMenuIsMissing() {
        migrate();
        jdbc.update("UPDATE sys_menu SET status = 0 WHERE menu_key = 'attendance-punch'");

        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "verify"));
        org.junit.jupiter.api.Assertions.assertTrue(error.getMessage().contains("attendance-punch"),
                "校验信息必须点出缺失的菜单 key，否则线上只能看到无上下文的启动失败");
    }

    /**
     * v1.0 已落库的环境里日报只有 view/export，而重算日报是写操作。
     * <p>本用例钉两件事：动作集必须被补齐（否则该能力永远授不出去），
     * 且只补日报这一个菜单（批量对齐会把管理员主动收窄过的授权静默扩回去）。
     */
    @Test
    void alignsDailyEditActionWithoutExpandingOtherGrants() {
        migrate();
        jdbc.update("UPDATE sys_menu SET actions = '[\"view\",\"export\"]' WHERE menu_key = 'attendance-daily'");
        jdbc.update("UPDATE sys_role_menu SET actions = '[\"view\",\"export\"]' WHERE menu_id = "
                + "(SELECT id FROM sys_menu WHERE menu_key = 'attendance-daily')");
        // 管理员在授权中心把异常处理收窄成只读
        jdbc.update("UPDATE sys_role_menu SET actions = '[\"view\"]' WHERE menu_id = "
                + "(SELECT id FROM sys_menu WHERE menu_key = 'attendance-exception')");

        ReflectionTestUtils.invokeMethod(initializer, "alignDailyActions");
        ReflectionTestUtils.invokeMethod(initializer, "verifyDailyActions");

        assertEquals(AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT, jdbc.queryForObject(
                "SELECT actions FROM sys_menu WHERE menu_key = 'attendance-daily'", String.class),
                "sys_menu.actions 是授权中心能勾出什么动作的唯一依据");
        assertEquals(AttendanceConstants.ACTIONS_VIEW_EXPORT_EDIT, jdbc.queryForObject(
                "SELECT rm.actions FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = 'admin' "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.menu_key = 'attendance-daily'", String.class),
                "admin 是内置运维角色，重算日报必须能做");
        assertEquals("[\"view\"]", jdbc.queryForObject(
                "SELECT rm.actions FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = 'admin' "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.menu_key = 'attendance-exception'", String.class),
                "其他菜单的收窄授权不得被静默扩权");
    }

    @Test
    void verifyDailyActionsFailsWhenNotAligned() {
        migrate();
        jdbc.update("UPDATE sys_menu SET actions = '[\"view\",\"export\"]' WHERE menu_key = 'attendance-daily'");

        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "verifyDailyActions"));
        assertTrue(error.getMessage().contains("attendance-daily"),
                "未对齐时必须不记版本并在下次启动重试，否则重算日报永久 403");
    }

    private void assertDoesNotThrowVerify() {
        ReflectionTestUtils.invokeMethod(initializer, "verify");
    }

    /**
     * v2.0：平铺的 12 个叶子菜单收入 4 个分组，工作台与設置保持独立顶级。
     * <p>本用例钉三件事：
     * ① 4 个分组必须为 type=1 顶级目录；
     * ② 10 个叶子必须挂入对应分组，顶级只剩 6 条（工作台 + 4 分组 + 設置）；
     * ③ verifyV2 对分组缺失真的失败。
     */
    @Test
    void groupsFlatMenusIntoFourCategoriesAndKeepsWorkbenchStandalone() {
        migrate();
        groupMenus();

        // 顶级只剩 6 条：工作台 + 4 分组 + 設置
        assertEquals(6, countTopAttendanceMenus());

        // 4 个分组必须为 type=1 顶级目录
        for (String gk : new String[]{
                AttendanceConstants.GROUP_OPS, AttendanceConstants.GROUP_BASIC,
                AttendanceConstants.GROUP_LEAVE, AttendanceConstants.GROUP_REPORT}) {
            assertEquals(1, jdbc.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 "
                            + "AND parent_id IS NULL AND type = 1 AND system_code = 'attendance'",
                    Integer.class, gk), gk + " 必须是 type=1 顶级分组");
        }

        // 考勤管理分组下挂 4 个叶子
        assertEquals(4, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE parent_id = "
                        + "(SELECT id FROM sys_menu WHERE menu_key = 'attendance-ops-group' AND deleted = 0 LIMIT 1) "
                        + "AND deleted = 0", Integer.class));

        // 请假管理分组下挂 2 个叶子（从 hr-profile 迁入的）
        assertEquals(2, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE parent_id = "
                        + "(SELECT id FROM sys_menu WHERE menu_key = 'attendance-leave-group' AND deleted = 0 LIMIT 1) "
                        + "AND deleted = 0", Integer.class));

        // 工作台仍为独立顶级
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'attendance-workbench' "
                        + "AND deleted = 0 AND parent_id IS NULL", Integer.class));

        // verifyV2 不抛异常
        verifyV2();
    }

    @Test
    void verifyV2FailsWhenAGroupIsMissing() {
        migrate();
        groupMenus();
        // 停用考勤管理分组
        jdbc.update("UPDATE sys_menu SET status = 0 WHERE menu_key = 'attendance-ops-group'");

        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "verifyV2"));
        assertTrue(error.getMessage().contains("attendance-ops-group"),
                "校验信息必须点出缺失的分组 key");
    }
}

package com.mftb.admin.config;

import com.mftb.admin.service.PermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * 隔离内存库验证会议使用侧基线授权：角色与部门两条线都铺齐、系统准入随行、
 * 管理员主动收窄的动作集不被重放扩权、治理侧菜单一律不铺、后置校验真的会失败。
 *
 * <p>用 H2 而不是 mock JdbcTemplate：这些行为全部由 SQL 语义决定
 * （缺行才插、非空不碰、INSERT IGNORE 不顶回管理员关掉的准入），
 * mock 只能断言「调过哪条语句」，改坏 WHERE 条件时用例照样绿。
 */
class MeetingAccessGrantInitializerTest {

    private static final long MENU_MY = 101L;
    private static final long MENU_BOOKING = 102L;
    private static final long MENU_ROOM = 103L;
    private static final long MENU_RECORD = 104L;
    private static final long MENU_CONFIG = 105L;

    private JdbcTemplate jdbc;
    private MeetingAccessGrantInitializer initializer;
    private PermissionService permissionService;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:meeting_grant_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT PRIMARY KEY, menu_key VARCHAR(100), name VARCHAR(100), "
                + "status INT DEFAULT 1, deleted INT DEFAULT 0, system_code VARCHAR(32))");
        jdbc.execute("INSERT INTO sys_menu (id, menu_key, name, system_code) VALUES "
                + "(" + MENU_MY + ", 'meeting-my', '我的會議', 'meeting'), "
                + "(" + MENU_BOOKING + ", 'meeting-booking', '會議室預約', 'meeting'), "
                + "(" + MENU_ROOM + ", 'meeting-room', '會議室檔案', 'meeting'), "
                + "(" + MENU_RECORD + ", 'meeting-record', '預約記錄', 'meeting'), "
                + "(" + MENU_CONFIG + ", 'meeting-config', '預約規則', 'meeting')");

        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), deleted INT DEFAULT 0, status INT DEFAULT 1)");
        // 1=admin（菜单种子已授全量）, 2=员工自助基底角色, 3=行政自建角色（被主动收窄）, 4=停用角色
        jdbc.execute("INSERT INTO sys_role VALUES (1, 'admin', 0, 1), (2, 'employee_self_service', 0, 1), "
                + "(3, 'ATTENDANCE_ADMIN', 0, 1), (4, 'retired_role', 0, 0)");
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (role_id, menu_id))");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (1, " + MENU_MY + ", '[\"view\",\"edit\"]')");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (1, " + MENU_BOOKING + ", '[\"view\",\"edit\"]')");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (1, " + MENU_ROOM + ", '[\"view\",\"create\",\"edit\"]')");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (1, " + MENU_RECORD + ", '[\"view\",\"edit\"]')");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (1, " + MENU_CONFIG + ", '[\"view\",\"edit\"]')");
        // 管理员把这个角色的订会权收成只读：重放不得把 edit 扩回去
        jdbc.execute("INSERT INTO sys_role_menu VALUES (3, " + MENU_BOOKING + ", '[\"view\"]')");
        // 授权中心建了行但没选动作（空动作中间态）：应当填上基线
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, " + MENU_MY + ", '[]')");

        jdbc.execute("CREATE TABLE sys_department (id BIGINT PRIMARY KEY, deleted INT DEFAULT 0, status INT DEFAULT 1)");
        jdbc.execute("INSERT INTO sys_department VALUES (4, 0, 1), (28, 0, 1), (99, 0, 0)");
        jdbc.execute("CREATE TABLE sys_department_menu (dept_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (dept_id, menu_id))");
        // 集团原本只有广告域菜单授权：不能被动到
        jdbc.execute("INSERT INTO sys_department_menu VALUES (4, 10, '[\"view\",\"create\",\"edit\",\"export\"]')");
        // 行政中心已把订会权授过且更宽（含 create）：保持原值
        jdbc.execute("INSERT INTO sys_department_menu VALUES (28, " + MENU_BOOKING + ", '[\"view\",\"create\"]')");

        jdbc.execute("CREATE TABLE sys_role_system (role_id BIGINT, system_code VARCHAR(32), PRIMARY KEY (role_id, system_code))");
        jdbc.execute("CREATE TABLE sys_department_system (dept_id BIGINT, system_code VARCHAR(32), PRIMARY KEY (dept_id, system_code))");

        permissionService = mock(PermissionService.class);
        initializer = new MeetingAccessGrantInitializer(jdbc, new SchemaVersionTracker(jdbc), permissionService);
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrate");
    }

    private void verifyGrants() {
        ReflectionTestUtils.invokeMethod(initializer, "verify");
    }

    private String actionsOfRole(long roleId, long menuId) {
        return jdbc.queryForList("SELECT actions FROM sys_role_menu WHERE role_id = ? AND menu_id = ?",
                String.class, roleId, menuId).stream().findFirst().orElse(null);
    }

    private String actionsOfDept(long deptId, long menuId) {
        return jdbc.queryForList("SELECT actions FROM sys_department_menu WHERE dept_id = ? AND menu_id = ?",
                String.class, deptId, menuId).stream().findFirst().orElse(null);
    }

    private int count(String sql) {
        Integer c = jdbc.queryForObject(sql, Integer.class);
        return c == null ? 0 : c;
    }

    @Test
    @DisplayName("使用侧两张菜单铺到所有启用角色与有效部门，系统准入两条线随行（v1.3 拍平后无分组行）")
    void baselineCoversEveryEnabledRoleAndDepartment() {
        migrate();

        for (long roleId : new long[]{1L, 2L, 3L}) {
            assertNotNull(actionsOfRole(roleId, MENU_MY), "角色 " + roleId + " 缺少我的會議授权");
            assertNotNull(actionsOfRole(roleId, MENU_BOOKING), "角色 " + roleId + " 缺少會議室預約授权");
            assertEquals(1, count("SELECT COUNT(*) FROM sys_role_system WHERE role_id = " + roleId
                    + " AND system_code = 'meeting'"), "角色 " + roleId + " 缺少 meeting 系统准入");
        }
        for (long deptId : new long[]{4L, 28L}) {
            assertNotNull(actionsOfDept(deptId, MENU_MY), "部门 " + deptId + " 缺少我的會議授权");
            assertNotNull(actionsOfDept(deptId, MENU_BOOKING), "部门 " + deptId + " 缺少會議室預約授权");
            assertEquals(1, count("SELECT COUNT(*) FROM sys_department_system WHERE dept_id = " + deptId
                    + " AND system_code = 'meeting'"), "部门 " + deptId + " 缺少 meeting 系统准入");
        }
        // 停用角色与停用部门不参与
        assertEquals(0, count("SELECT COUNT(*) FROM sys_role_menu WHERE role_id = 4"));
        assertEquals(0, count("SELECT COUNT(*) FROM sys_department_menu WHERE dept_id = 99"));
        // 授权缓存必须失效，否则改动要等到进程重启才生效（登录中的用户菜单不变）
        verify(permissionService).evictAll();
    }

    @Test
    @DisplayName("管理员主动收窄的动作集不被重放扩权，空动作行才填默认值")
    void narrowedActionSetsAreNeverWidenedBack() {
        migrate();

        // 只 view 就是只 view：扩回 edit 等于启动重放替管理员做了决定
        assertEquals("[\"view\"]", actionsOfRole(3L, MENU_BOOKING));
        // 比基线更宽（含 create）的部门授权原样保留
        assertEquals("[\"view\",\"create\"]", actionsOfDept(28L, MENU_BOOKING));
        // 空动作是「建了行没选动作」的中间态，按基线填上
        assertEquals("[\"view\",\"edit\"]", actionsOfRole(2L, MENU_MY));
        // 非会议域的既有授权不受影响
        assertEquals("[\"view\",\"create\",\"edit\",\"export\"]", actionsOfDept(4L, 10L));
    }

    @Test
    @DisplayName("治理侧三张菜单一律不铺给非 admin：档案影响全部房间、规则影响全站口径")
    void governanceMenusStayOutOfBaseline() {
        migrate();

        assertEquals(0, count("SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id "
                + "WHERE rm.menu_id IN (" + MENU_ROOM + "," + MENU_RECORD + "," + MENU_CONFIG + ") "
                + "AND r.code <> 'admin'"), "基线把治理菜单铺给了非 admin 角色");
        assertEquals(0, count("SELECT COUNT(*) FROM sys_department_menu WHERE menu_id IN ("
                + MENU_ROOM + "," + MENU_RECORD + "," + MENU_CONFIG + ")"), "基线把治理菜单铺给了部门");
        // admin 原有治理授权不被改写
        assertEquals("[\"view\",\"create\",\"edit\"]", actionsOfRole(1L, MENU_ROOM));
    }

    @Test
    @DisplayName("重放幂等：二次启动不新增行、不改动作集")
    void replayIsIdempotent() {
        migrate();
        int roleRows = count("SELECT COUNT(*) FROM sys_role_menu");
        int deptRows = count("SELECT COUNT(*) FROM sys_department_menu");
        String bookingActions = actionsOfRole(3L, MENU_BOOKING);

        migrate();

        assertEquals(roleRows, count("SELECT COUNT(*) FROM sys_role_menu"));
        assertEquals(deptRows, count("SELECT COUNT(*) FROM sys_department_menu"));
        assertEquals(bookingActions, actionsOfRole(3L, MENU_BOOKING));
    }

    @Test
    @DisplayName("后置校验：基线行被删掉必须失败，不能让「已记版本但实际没铺齐」静默通过")
    void verifyFailsWhenBaselineIsIncomplete() {
        migrate();
        verifyGrants();

        jdbc.update("DELETE FROM sys_role_menu WHERE role_id = 2 AND menu_id = " + MENU_BOOKING);
        IllegalStateException ex = assertThrows(IllegalStateException.class, this::verifyGrants);
        assertTrue(ex.getMessage().contains("meeting-booking"), ex.getMessage());
    }

    @Test
    @DisplayName("后置校验：缺系统准入同样失败（菜单授权与准入是两条线，缺一条门户就剪掉整棵子树）")
    void verifyFailsWhenSystemAccessMissing() {
        migrate();
        jdbc.update("DELETE FROM sys_department_system WHERE dept_id = 4 AND system_code = 'meeting'");

        IllegalStateException ex = assertThrows(IllegalStateException.class, this::verifyGrants);
        assertTrue(ex.getMessage().contains("meeting"), ex.getMessage());
    }

    @Test
    @DisplayName("菜单尚未落地时直接失败而不是跳过：静默跳过会让员工在启动成功后依然 403")
    void migrateFailsFastWhenMenuMissing() {
        jdbc.update("DELETE FROM sys_menu WHERE id = " + MENU_MY);

        IllegalStateException ex = assertThrows(IllegalStateException.class, this::migrate);
        assertTrue(ex.getMessage().contains("meeting-my"), ex.getMessage());
    }

    @Test
    @DisplayName("基线只含使用侧两张（防止后来者往映射里塞治理菜单或已删的分组行）")
    void baselineMenuKeysAreUsageSideOnly() {
        List<String> keys = new ArrayList<>();
        @SuppressWarnings("unchecked")
        Map<String, String> menus = (Map<String, String>) ReflectionTestUtils.getField(
                initializer, "BASELINE_MENUS");
        assertNotNull(menus);
        keys.addAll(menus.keySet());

        assertEquals(List.of("meeting-my", "meeting-booking"), keys);
        assertTrue(menus.get("meeting-my").contains("edit"), "响应邀约与签到走 MY:edit，缺它员工点不动接受/拒绝");
        assertTrue(menus.get("meeting-booking").contains("edit"), "新建/变更/取消预约走 BOOKING:edit");
    }
}

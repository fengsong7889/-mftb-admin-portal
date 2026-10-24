package com.mftb.admin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 分组授权继承（{@code rdm:menu-group-grant-inherit:v1}）的 H2 集成测试。
 *
 * <p>这一步真的往 {@code sys_role_menu} / {@code sys_department_menu} 写授权行，
 * 原先每次启动都会重放 INSERT IGNORE，导致管理员撤销的子菜单授权被父菜单再插回来。
 * 每条断言对应一种事故：
 * <ol>
 *   <li><b>升级当天不降权</b>：父分组上的授权必须复制到新增叶子，否则升级后普通用户点开是空白；</li>
 *   <li><b>撤权不复活</b>：登记号已应用后不得再写授权行；</li>
 *   <li><b>验收只看结构</b>：管理员撤权后 {@code verifyGroupGrantNodes()} 仍应通过，
 *       否则一次合法撤权会让下次启动直接失败；</li>
 *   <li><b>两张表一起处理</b>：漏掉部门表就会出现「角色能用、部门不能用」。</li>
 * </ol>
 */
class RdmGroupGrantInheritTest {

    private static final long MENU_DASHBOARD = 2001L;
    private static final long MENU_EFFICIENCY = 2002L;
    private static final long MENU_DELIVERY = 2003L;
    private static final long MENU_TEST_GROUP = 2004L;
    private static final long MENU_RELEASE_GROUP = 2005L;
    private static final long MENU_DELIVERY_TEST = 2006L;
    private static final long MENU_DASHBOARD_QUALITY = 2007L;
    private static final long MENU_ACCEPTANCE = 2008L;
    private static final long MENU_DELIVERY_RELEASE = 2009L;
    private static final long MENU_DASHBOARD_VERSION = 2010L;

    private JdbcTemplate jdbc;
    private RdmMenuInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:group_inherit_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT PRIMARY KEY, menu_key VARCHAR(64), deleted INT DEFAULT 0)");
        jdbc.update("INSERT INTO sys_menu VALUES "
                + "(2001,'rdm-dashboard',0),(2002,'rdm-efficiency',0),(2003,'rdm-delivery',0),"
                + "(2004,'rdm-test-quality-group',0),(2005,'rdm-release-accept-group',0),"
                + "(2006,'rdm-delivery-test',0),(2007,'rdm-dashboard-quality',0),"
                + "(2008,'rdm-acceptance',0),(2009,'rdm-delivery-release',0),(2010,'rdm-dashboard-version',0)");
        // 真库 sys_role_menu / sys_department_menu 有 (role_id|dept_id, menu_id) 主键，
        // INSERT IGNORE 的幂等语义依赖它；建表漏掉主键会让“重复执行”在 H2 里凭空多出行。
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (role_id, menu_id))");
        jdbc.execute("CREATE TABLE sys_department_menu (dept_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (dept_id, menu_id))");
        initializer = new RdmMenuInitializer(jdbc, mock(SchemaVersionTracker.class),
                mock(com.mftb.admin.service.PermissionService.class), new ObjectMapper());
    }

    /** 真实版本登记器：applyOnce 的「已应用不再执行」依赖它落库 */
    private SchemaVersionTracker tracker() {
        SchemaVersionTracker t = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(t, "buildTag", "group-inherit-test");
        return t;
    }

    private void grantRole(long roleId, long menuId) {
        jdbc.update("INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, "[\"view\"]");
    }

    private int countRole(long roleId, long menuId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu WHERE role_id = ? AND menu_id = ?", Integer.class, roleId, menuId);
        return n == null ? 0 : n;
    }

    @Test
    @DisplayName("首次执行：父分组授权复制到新增叶子，角色与部门两张表都覆盖")
    void copiesParentGrantsToNewLeaves() {
        grantRole(31L, MENU_DELIVERY);
        jdbc.update("INSERT INTO sys_department_menu (dept_id, menu_id, actions) VALUES (?, ?, ?)",
                41L, MENU_DELIVERY, "[\"view\"]");

        initializer.inheritGroupGrants();

        // rdm-delivery → 两个新分组 → 各自的叶子形成继承链
        assertEquals(1, countRole(31L, MENU_TEST_GROUP));
        assertEquals(1, countRole(31L, MENU_RELEASE_GROUP));
        assertEquals(1, countRole(31L, MENU_DELIVERY_TEST));
        assertEquals(1, countRole(31L, MENU_DELIVERY_RELEASE));
        Integer dept = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_department_menu WHERE dept_id = 41 AND menu_id = ?", Integer.class, MENU_ACCEPTANCE);
        assertEquals(1, dept);
    }

    @Test
    @DisplayName("撤权不复活：登记号已应用后，管理员删掉的子菜单授权不会被重放加回")
    void revokedGrantDoesNotComeBackAfterRestart() {
        grantRole(33L, MENU_DELIVERY);
        SchemaVersionTracker tracker = tracker();
        String versionKey = "rdm:menu-group-grant-inherit-test:v1";

        assertTrue(tracker.applyOnce(versionKey, initializer::inheritGroupGrants, initializer::verifyGroupGrantNodes));
        assertEquals(1, countRole(33L, MENU_DELIVERY_TEST));

        // 管理员在授权中心撤销了该角色对「測試與驗收」的授权
        jdbc.update("DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id = ?", 33L, MENU_DELIVERY_TEST);

        // 模拟下一次启动：同一登记号已应用，applyOnce 必须直接返回 false 且不再写授权行
        assertFalse(tracker.applyOnce(versionKey, initializer::inheritGroupGrants, initializer::verifyGroupGrantNodes));
        assertEquals(0, countRole(33L, MENU_DELIVERY_TEST), "撤销的授权被启动重放复活了");
    }

    @Test
    @DisplayName("验收只看结构：撤权后仍应通过，不能把合法撤权判成启动失败")
    void verifyIgnoresRevokedGrants() {
        grantRole(35L, MENU_DASHBOARD);
        initializer.inheritGroupGrants();
        // 撤销全部继承结果，只留结构
        jdbc.update("DELETE FROM sys_role_menu");

        initializer.verifyGroupGrantNodes();
    }

    @Test
    @DisplayName("节点缺失时验收报错：继承前提不满足必须中断，而不是静默少授")
    void verifyRejectsMissingNode() {
        jdbc.update("UPDATE sys_menu SET deleted = 1 WHERE id = ?", MENU_DASHBOARD_VERSION);

        IllegalStateException ex = assertThrows(IllegalStateException.class, initializer::verifyGroupGrantNodes);
        assertTrue(ex.getMessage().contains("rdm-dashboard-version"), ex.getMessage());
    }

    @Test
    @DisplayName("幂等：同一进程内重复执行不产生重复行")
    void repeatedRunIsIdempotent() {
        grantRole(37L, MENU_EFFICIENCY);
        grantRole(37L, MENU_DASHBOARD);

        initializer.inheritGroupGrants();
        List<Integer> before = jdbc.queryForList("SELECT COUNT(*) FROM sys_role_menu", Integer.class);
        initializer.inheritGroupGrants();

        assertEquals(before, jdbc.queryForList("SELECT COUNT(*) FROM sys_role_menu", Integer.class));
    }
}

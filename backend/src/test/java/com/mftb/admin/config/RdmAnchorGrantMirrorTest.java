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
 * 锚点授权镜像（{@code rdm:anchor-grant-mirror:v1}）的 H2 集成测试。
 *
 * <p>这一步真的写授权行，所以每条断言都对应一种事故：
 * <ol>
 *   <li><b>不降权</b>：旧锚点上的每个能力都必须在新锚点上拿到对应动作，否则切注解后 403；</li>
 *   <li><b>不扩权</b>：只持有台账 view/create 的人，绝不能因为镜像白拿全量可见或分配权；</li>
 *   <li><b>只增不减</b>：目标菜单上管理员已有的动作不能被抹掉；</li>
 *   <li><b>撤权不复活</b>：镜像只能执行一次 —— 管理员事后撤销的新锚点授权，
 *       不允许被下一次启动的“结构自愈”从旧锚点重新加回来（方案 §五 红线）；</li>
 *   <li><b>两张表一起处理</b>：漏掉部门表就会出现“角色能用、部门不能用”。</li>
 * </ol>
 */
class RdmAnchorGrantMirrorTest {

    private static final long MENU_INTAKE_ID = 1183L;
    private static final long MENU_REQUIREMENT_ID = 1182L;
    private static final long MENU_ITERATION_ID = 1217L;

    private JdbcTemplate jdbc;
    private RdmMenuInitializer initializer;
    private SchemaVersionTracker tracker;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:anchor_mirror_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT PRIMARY KEY, menu_key VARCHAR(64), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO sys_menu VALUES "
                + "(1183, 'rdm-intake', 0), (1182, 'rdm-requirement', 0), (1217, 'rdm-delivery-iteration', 0)");
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255))");
        jdbc.execute("CREATE TABLE sys_department_menu (dept_id BIGINT, menu_id BIGINT, actions VARCHAR(255))");
        initializer = new RdmMenuInitializer(jdbc, mock(SchemaVersionTracker.class),
                mock(com.mftb.admin.service.PermissionService.class), new ObjectMapper());
        tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "anchor-mirror-test");
    }

    private void grantRole(long roleId, long menuId, String... actions) {
        jdbc.update("INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, toJson(actions));
    }

    private void grantDept(long deptId, long menuId, String... actions) {
        jdbc.update("INSERT INTO sys_department_menu (dept_id, menu_id, actions) VALUES (?, ?, ?)",
                deptId, menuId, toJson(actions));
    }

    private String toJson(String... actions) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < actions.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(actions[i]).append('"');
        }
        return sb.append(']').toString();
    }

    /** 读取动作集并按字典顺序返回，方便断言字面量 */
    private List<String> actionsOf(long roleId, long menuId) {
        List<String> rows = jdbc.queryForList(
                "SELECT actions FROM sys_role_menu WHERE role_id = ? AND menu_id = ?", String.class, roleId, menuId);
        if (rows.isEmpty()) {
            return List.of();
        }
        return parse(rows.get(0));
    }

    private List<String> parse(String raw) {
        try {
            return new ObjectMapper().readValue(raw,
                    new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {
                    });
        } catch (Exception e) {
            throw new AssertionError("非法的动作 JSON: " + raw, e);
        }
    }

    /** 走生产同款入口：applyOnce + 后置校验，验证“只跑一次”的语义 */
    private void runMirrorOnce() {
        tracker.applyOnce(mirrorVersionKey(), initializer::mirrorAnchorGrants, initializer::verifyAnchorMirror);
    }

    private String mirrorVersionKey() {
        return (String) ReflectionTestUtils.getField(RdmMenuInitializer.class, "MIRROR_VERSION_KEY");
    }

    @Test
    @DisplayName("不降权：旧锚点五个动作全部在新锚点接住，且源授权保持不变")
    void everyLegacyCapabilityIsMirrored() {
        grantRole(7L, MENU_INTAKE_ID, "view", "create", "edit", "delete", "export");

        runMirrorOnce();

        // 目标菜单原本没有该主体的行 → 新建一行，只带映射出来的四个动作；
        // 字面量顺序按 ACTION_ORDER 重组（export 在 view_all 之前），不是映射声明顺序
        assertEquals(List.of("export", "view_all", "dispatch", "contribute"),
                actionsOf(7L, MENU_REQUIREMENT_ID));
        assertTrue(actionsOf(7L, MENU_ITERATION_ID).contains("delete"));
        // 源行原样保留：退役那批才负责清理，镜像不得顺手删（删早了无法对账回滚）
        assertEquals(List.of("view", "create", "edit", "delete", "export"), actionsOf(7L, MENU_INTAKE_ID));
    }

    /**
     * 这条是本步最要紧的负向断言：镜像的依据是“旧锚点上有什么”，
     * 若实现写成“给所有 requirement 持有者补 view_all”，就等于把全量可见发给每个能看台账的人。
     */
    @Test
    @DisplayName("不扩权：只持有 requirement view/create 的人不会白拿 view_all 或 dispatch")
    void mirrorNeverBroadensBeyondSource() {
        grantRole(9L, MENU_REQUIREMENT_ID, "view", "create");

        runMirrorOnce();

        List<String> after = actionsOf(9L, MENU_REQUIREMENT_ID);
        assertEquals(List.of("view", "create"), after, after.toString());
        assertFalse(after.contains("view_all"));
        assertFalse(after.contains("dispatch"));
    }

    /**
     * 撤权不复活：镜像执行过后，管理员在新锚点上撤销 view_all，重放启动流程不应再加回来。
     * <p>这就是把镜像放进独立 versionKey、且不进每次启动 migrate() 的理由。
     */
    @Test
    @DisplayName("镜像只执行一次：管理员撤销的新锚点授权不会被重放复活")
    void revokedGrantDoesNotComeBackOnReplay() {
        grantRole(11L, MENU_INTAKE_ID, "view", "edit");
        runMirrorOnce();
        assertTrue(actionsOf(11L, MENU_REQUIREMENT_ID).contains("view_all"));

        // 管理员在授权中心把 view_all 撤了（保留 view）
        jdbc.update("UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ?",
                "[\"view\"]", 11L, MENU_REQUIREMENT_ID);

        // 模拟下一次启动：同一 versionKey 已应用，applyOnce 必须直接返回 false 且不重跑
        assertFalse(tracker.applyOnce(mirrorVersionKey(), initializer::mirrorAnchorGrants, initializer::verifyAnchorMirror));
        List<String> after = actionsOf(11L, MENU_REQUIREMENT_ID);
        assertEquals(List.of("view"), after, "撤销的 view_all 被重放复活了: " + after);
    }

    @Test
    @DisplayName("只增不减：目标菜单已有的自定义动作不被抹掉，写入顺序按字典稳定")
    void unionWriteKeepsExistingTargetActions() {
        grantRole(13L, MENU_INTAKE_ID, "view");
        // 目标菜单上管理员此前自定义过 delete（种子 requirement 动作里没有它，但授权行里可以有）
        grantRole(13L, MENU_REQUIREMENT_ID, "view", "delete");

        runMirrorOnce();

        assertEquals(List.of("view", "delete", "view_all"), actionsOf(13L, MENU_REQUIREMENT_ID));
    }

    @Test
    @DisplayName("幂等：连续两次镜像，行数与内容都不变")
    void repeatedMirrorIsIdempotent() {
        grantRole(15L, MENU_INTAKE_ID, "view", "edit", "export");
        initializer.mirrorAnchorGrants();
        int rowsAfterFirst = jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu", Integer.class);
        String afterFirst = jdbc.queryForObject(
                "SELECT actions FROM sys_role_menu WHERE role_id = 15 AND menu_id = 1182", String.class);

        initializer.mirrorAnchorGrants();

        assertEquals(rowsAfterFirst, (int) jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu", Integer.class));
        assertEquals(afterFirst, jdbc.queryForObject(
                "SELECT actions FROM sys_role_menu WHERE role_id = 15 AND menu_id = 1182", String.class));
    }

    @Test
    @DisplayName("部门授权同样镜像，避免「角色能用、部门不能用」")
    void departmentGrantsAreMirroredToo() {
        grantDept(21L, MENU_INTAKE_ID, "view", "edit");

        runMirrorOnce();

        List<String> deptActions = jdbc.queryForList(
                "SELECT actions FROM sys_department_menu WHERE dept_id = 21 AND menu_id = 1182", String.class)
                .stream().findFirst().map(this::parse).orElse(List.of());
        assertTrue(deptActions.containsAll(List.of("view_all", "dispatch")), deptActions.toString());
    }

    @Test
    @DisplayName("后置校验能抓到镜像漏写")
    void verifyCatchesMissingMirror() {
        grantRole(23L, MENU_INTAKE_ID, "view");

        initializer.mirrorAnchorGrants();
        // 人为制造漏写：把刚镜像出来的目标行删掉
        jdbc.update("DELETE FROM sys_role_menu WHERE role_id = 23 AND menu_id = 1182");

        IllegalStateException ex = assertThrows(IllegalStateException.class, initializer::verifyAnchorMirror);
        assertTrue(ex.getMessage().contains("view_all"), ex.getMessage());
    }

    @Test
    @DisplayName("源菜单已退役时安全空转，不误写也不报错")
    void skipsWhenSourceAlreadyRetired() {
        jdbc.update("UPDATE sys_menu SET deleted = 1 WHERE id = ?", MENU_INTAKE_ID);

        initializer.mirrorAnchorGrants();
        initializer.verifyAnchorMirror();

        assertEquals(0, (int) jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu", Integer.class));
    }
}

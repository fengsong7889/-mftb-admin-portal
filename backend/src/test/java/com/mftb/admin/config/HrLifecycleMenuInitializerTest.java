package com.mftb.admin.config;

import com.mftb.admin.service.PermissionService;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * 隔离内存库验证 HR 入轉調離菜单的挂载父级：v45 把一级包装目录 {@code hr} 物理退役后，
 * 四个菜单必须挂到升为一级的 {@code hr-lifecycle} 分组，而不是继续硬依赖 {@code hr}。
 *
 * <p>用 H2 而不是 mock JdbcTemplate：父级解析、软删残留清理、授权回填全部由 SQL 语义决定，
 * mock 只能断言「调过哪条语句」，把父级 key 改错时用例照样绿。
 */
class HrLifecycleMenuInitializerTest {

    private static final long MENU_HR_LIFECYCLE = 100L;
    private static final long MENU_HR_LEGACY = 200L;
    private static final long ROLE_ADMIN = 1L;

    private static final String[] LIFECYCLE_MENU_KEYS = {
            "hr-onboarding", "hr-regularization", "hr-transfer", "hr-dimission"};

    private JdbcTemplate jdbc;
    private SchemaVersionTracker versionTracker;
    private PermissionService permissionService;
    private HrLifecycleMenuInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:hr_lifecycle_menu_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        // uk_menu_key 不区分 deleted（与生产一致）：软删残留不清掉就会撞唯一键
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT AUTO_INCREMENT PRIMARY KEY, parent_id BIGINT, "
                + "menu_key VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(100), name_en VARCHAR(100), "
                + "icon VARCHAR(64), type INT, sort_order INT, status INT, deleted INT DEFAULT 0)");
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO sys_role VALUES (" + ROLE_ADMIN + ", 'admin', 0)");
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (role_id, menu_id))");

        versionTracker = new SchemaVersionTracker(jdbc);
        permissionService = mock(PermissionService.class);
        initializer = new HrLifecycleMenuInitializer(jdbc, versionTracker, permissionService);
    }

    private void insertMenu(long id, String menuKey, Long parentId) {
        jdbc.update("INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) "
                + "VALUES (?, ?, ?, ?, 1, 1, 1, 0)", id, parentId, menuKey, menuKey);
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrate");
    }

    private void verifyMenuMounted() {
        ReflectionTestUtils.invokeMethod(initializer, "verify");
    }

    private Long parentOf(String menuKey) {
        return jdbc.queryForList("SELECT parent_id FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                Long.class, menuKey).stream().findFirst().orElse(null);
    }

    private int count(String sql, Object... args) {
        Integer c = jdbc.queryForObject(sql, Integer.class, args);
        return c == null ? 0 : c;
    }

    @Test
    @DisplayName("v45 后：四个菜单挂到升为一级的 hr-lifecycle 分组，并补 admin 全量授权")
    void mountsUnderLifecycleGroupAfterWrapperRetired() {
        insertMenu(MENU_HR_LIFECYCLE, "hr-lifecycle", null);

        initializer.run();

        for (String key : LIFECYCLE_MENU_KEYS) {
            assertEquals(MENU_HR_LIFECYCLE, parentOf(key), key + " 未挂到入轉調離分组");
            assertEquals(1, count("SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND type = 2 AND status = 1 "
                    + "AND deleted = 0", key), key + " 叶子属性不正确");
            assertEquals(1, count("SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND name_en IS NOT NULL "
                    + "AND name_en <> ''", key), key + " 英文名未补");
            assertEquals(1, count("SELECT COUNT(*) FROM sys_role_menu WHERE role_id = ? AND menu_id = "
                    + "(SELECT id FROM sys_menu WHERE menu_key = ?)", ROLE_ADMIN, key), key + " 缺 admin 授权");
        }
        assertEquals("[\"view\",\"create\",\"edit\",\"delete\",\"export\"]",
                jdbc.queryForObject("SELECT actions FROM sys_role_menu WHERE role_id = ? AND menu_id = "
                        + "(SELECT id FROM sys_menu WHERE menu_key = 'hr-onboarding')", String.class, ROLE_ADMIN));
        verify(permissionService).evictAll();
        assertTrue(versionTracker.isApplied((String) ReflectionTestUtils.getField(initializer, "VERSION_KEY")),
                "校验通过后必须记版本，否则每次启动重跑");
    }

    @Test
    @DisplayName("存量旧库：只有 hr 包装目录时仍能挂载（v44 及之前的结构）")
    void fallsBackToLegacyWrapperOnOldDatabase() {
        insertMenu(MENU_HR_LEGACY, "hr", null);

        migrate();

        for (String key : LIFECYCLE_MENU_KEYS) {
            assertEquals(MENU_HR_LEGACY, parentOf(key), key + " 未挂到旧 hr 目录");
        }
        verifyMenuMounted();
    }

    @Test
    @DisplayName("两者并存时优先 hr-lifecycle，不再挂回已退役的 hr")
    void prefersLifecycleGroupWhenBothExist() {
        insertMenu(MENU_HR_LEGACY, "hr", null);
        insertMenu(MENU_HR_LIFECYCLE, "hr-lifecycle", null);

        migrate();

        for (String key : LIFECYCLE_MENU_KEYS) {
            assertEquals(MENU_HR_LIFECYCLE, parentOf(key), key + " 被挂回已退役的 hr 目录");
        }
    }

    @Test
    @DisplayName("重放幂等：二次执行不新增菜单行，也不改已有关联")
    void replayIsIdempotent() {
        insertMenu(MENU_HR_LIFECYCLE, "hr-lifecycle", null);
        migrate();
        int menuRows = count("SELECT COUNT(*) FROM sys_menu");
        int grantRows = count("SELECT COUNT(*) FROM sys_role_menu");

        migrate();

        assertEquals(menuRows, count("SELECT COUNT(*) FROM sys_menu"));
        assertEquals(grantRows, count("SELECT COUNT(*) FROM sys_role_menu"));
    }

    @Test
    @DisplayName("同 key 软删残留先清理再插入，否则撞 uk_menu_key 让整个迁移失败")
    void clearsSoftDeletedResidueBeforeInsert() {
        insertMenu(MENU_HR_LIFECYCLE, "hr-lifecycle", null);
        jdbc.update("INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted) "
                + "VALUES (NULL, 'hr-transfer', '調動管理', 2, 99, 1, 1)");

        migrate();

        assertEquals(0, count("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'hr-transfer' AND deleted = 1"),
                "软删残留下仍在，会撞唯一键");
        assertEquals(MENU_HR_LIFECYCLE, parentOf("hr-transfer"));
    }

    @Test
    @DisplayName("分组与旧目录都不在：不抛异常刷屏，但仍不记成功版本（后置校验拦住假成功）")
    void skipsMountingWhenNoParentButNeverRecordsSuccess() {
        // run() 内部 applyOnce：migrate 不抛，verify 抛，异常被 run 捕获后只记日志
        initializer.run();

        assertEquals(0, count("SELECT COUNT(*) FROM sys_menu"), "缺父级时不得把菜单挂成顶级");
        IllegalStateException ex = assertThrows(IllegalStateException.class, this::verifyMenuMounted);
        assertTrue(ex.getMessage().contains("菜單未就緒"), ex.getMessage());
        assertFalse(versionTracker.isApplied((String) ReflectionTestUtils.getField(initializer, "VERSION_KEY")),
                "校验没过却记了版本，缺陷会被永久掩埋");
    }

    @Test
    @DisplayName("后置校验：菜单挂在错误父级下必须失败")
    void verifyFailsWhenMenuMountedUnderWrongParent() {
        insertMenu(MENU_HR_LEGACY, "hr", null);
        insertMenu(MENU_HR_LIFECYCLE, "hr-lifecycle", null);
        migrate();
        jdbc.update("UPDATE sys_menu SET parent_id = ? WHERE menu_key = 'hr-transfer'", MENU_HR_LEGACY);

        IllegalStateException ex = assertThrows(IllegalStateException.class, this::verifyMenuMounted);
        assertTrue(ex.getMessage().contains("hr-transfer"), ex.getMessage());
    }

    @Test
    @DisplayName("后置校验：菜单被删掉必须失败，不能让「已记版本但入口不存在」静默通过")
    void verifyFailsWhenMenuMissing() {
        insertMenu(MENU_HR_LIFECYCLE, "hr-lifecycle", null);
        migrate();
        jdbc.update("DELETE FROM sys_menu WHERE menu_key = 'hr-dimission'");

        IllegalStateException ex = assertThrows(IllegalStateException.class, this::verifyMenuMounted);
        assertTrue(ex.getMessage().contains("hr-dimission"), ex.getMessage());
    }

    @Test
    @DisplayName("父级候选顺序固定：hr-lifecycle 在前，hr 仅作存量兼容")
    void parentCandidatesAreOrderedLifecycleFirst() {
        @SuppressWarnings("unchecked")
        List<String> keys = java.util.Arrays.asList(
                (String[]) ReflectionTestUtils.getField(initializer, "PARENT_MENU_KEYS"));

        assertEquals(List.of("hr-lifecycle", "hr"), keys);
        assertNull(parentOf("hr-onboarding"), "初始库不应存在菜单");
    }
}

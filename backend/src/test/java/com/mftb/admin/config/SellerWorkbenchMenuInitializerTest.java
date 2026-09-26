package com.mftb.admin.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** 隔离内存库验证商家工作台拆分：菜单换父级、子树归属改写、准入反推补授与幂等自愈。 */
class SellerWorkbenchMenuInitializerTest {

    private static final String VERSION = SystemPortalSchemaInitializer.V_SELLER_WORKBENCH;
    private JdbcTemplate jdbc;
    private SchemaVersionTracker tracker;
    private SystemPortalSchemaInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:seller_wb_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT AUTO_INCREMENT PRIMARY KEY, parent_id BIGINT, "
                + "menu_key VARCHAR(100) UNIQUE, name VARCHAR(100), name_en VARCHAR(100), path VARCHAR(200), "
                + "icon VARCHAR(100), type INT DEFAULT 2, sort_order INT DEFAULT 1, actions VARCHAR(255), "
                + "status INT DEFAULT 1, deleted INT DEFAULT 0, system_code VARCHAR(32), updated_by VARCHAR(64))");
        // 广告系统现状：promotion_tool 目录 → 购买入口 + 报表组 → 报表叶子
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, type, system_code) VALUES "
                + "(1, NULL, 'promotion_tool', '推廣通', 1, 'ads'), "
                + "(2, 1, 'promotion-sales-config', '店鋪推廣', 2, 'ads'), "
                + "(3, 1, 'promotion-report-group', '報表分析', 1, 'ads'), "
                + "(4, 3, 'promotion-report-overview', '數據概覽', 2, 'ads'), "
                + "(5, 3, 'promotion-report-order', '訂單報表', 2, NULL), "
                + "(6, NULL, 'finance', '財務管理', 1, 'finance')");
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), deleted INT DEFAULT 0, status INT DEFAULT 1)");
        jdbc.execute("INSERT INTO sys_role VALUES (1, 'admin', 0, 1), (2, 'ops', 0, 1)");
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (role_id, menu_id))");
        // ops 角色持有报表叶子与购买入口授权 → 应反推获得 seller 准入；finance 不受影响
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, 2, '[\"view\"]'), (2, 4, '[\"view\",\"export\"]')");
        jdbc.execute("CREATE TABLE sys_department_menu (dept_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (dept_id, menu_id))");
        jdbc.execute("INSERT INTO sys_department_menu VALUES (7, 3, '[\"view\"]')");
        jdbc.execute("CREATE TABLE sys_role_system (role_id BIGINT, system_code VARCHAR(32), PRIMARY KEY (role_id, system_code))");
        jdbc.execute("CREATE TABLE sys_department_system (dept_id BIGINT, system_code VARCHAR(32), PRIMARY KEY (dept_id, system_code))");
        tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "seller-workbench-test");
        tracker.isApplied(VERSION);
        jdbc.update("INSERT INTO sys_schema_version (version_key) VALUES ('core:system-portal:v1.0')");
        initializer = new SystemPortalSchemaInitializer(jdbc, tracker);
    }

    @AfterEach
    void tearDown() {
        if (jdbc != null) jdbc.execute("SHUTDOWN");
    }

    @Test
    void movesPurchaseAndReportsToSellerCenterAndDerivesAccess() {
        initializer.ensureSellerWorkbench();

        Long sellerCenterId = jdbc.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = 'seller-center'", Long.class);
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'seller-center' "
                + "AND parent_id IS NULL AND type = 1 AND system_code = 'seller' AND status = 1 AND deleted = 0", Integer.class));
        // 购买入口与报表组双双换父级挂到 seller-center 下，ID 与既有授权保留
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key IN "
                + "('promotion-sales-config', 'promotion-report-group') AND parent_id = ? AND system_code = 'seller'",
                Integer.class, sellerCenterId));
        // 子树归属强制跟随（含显式 ads 与 NULL 归属的报表叶子）
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key IN "
                + "('promotion-report-overview', 'promotion-report-order') AND system_code = 'seller'", Integer.class));
        // 准入反推：ops 角色与部门 7 补授 seller；finance 侧不误伤
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE role_id = 2 AND system_code = 'seller'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system WHERE dept_id = 7 AND system_code = 'seller'", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE system_code = 'finance'", Integer.class));
        // admin 补授目录 view
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id = 1 AND menu_id = ? "
                + "AND actions = '[\"view\"]'", Integer.class, sellerCenterId));
        // 版本已记录
        assertTrue(tracker.isApplied(VERSION));
    }

    @Test
    void rerunIsIdempotentAndHealsDrift() {
        initializer.ensureSellerWorkbench();
        Long sellerCenterId = jdbc.queryForObject("SELECT id FROM sys_menu WHERE menu_key = 'seller-center'", Long.class);

        // 模拟菜单配置页误把购买入口挂回广告目录
        jdbc.update("UPDATE sys_menu SET parent_id = 1, system_code = 'ads' WHERE menu_key = 'promotion-sales-config'");
        initializer.ensureSellerWorkbench();

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'seller-center'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'promotion-sales-config' "
                + "AND parent_id = ? AND system_code = 'seller'", Integer.class, sellerCenterId));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE role_id = 2 AND system_code = 'seller'", Integer.class));
    }

    @Test
    void clearsSoftDeletedTombstoneBeforeCreate() {
        // uk_menu_key 全局唯一：软删残留会挡建表路径（v44 生产事故模式）
        jdbc.execute("INSERT INTO sys_menu (menu_key, name, deleted) VALUES ('seller-center', '残留', 1)");
        initializer.ensureSellerWorkbench();
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE deleted = 1 AND menu_key LIKE 'seller-center%'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'seller-center' AND deleted = 0", Integer.class));
    }

    @Test
    void translationSystemHealsTreeAndDerivesAccessIdempotently() {
        // 生产现状：i18n-center 树随 v1.0 一次性回填挂在 platform（含 NULL 后代）
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, type, system_code) VALUES "
                + "(100, NULL, 'i18n-center', '多語言管理', 1, 'platform'), "
                + "(101, 100, 'translation-manage', '翻譯工作台', 2, 'platform'), "
                + "(102, 100, 'i18n-language', '語言管理', 2, NULL), "
                + "(103, NULL, 'system-config', '系統配置', 1, 'platform')");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, 101, '[\"view\"]')");
        jdbc.execute("INSERT INTO sys_department_menu VALUES (7, 102, '[\"view\",\"edit\"]')");

        initializer.reconcileTranslationSystem();

        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE id IN (100, 101, 102) AND system_code = 'i18n'", Integer.class));
        assertEquals("platform", jdbc.queryForObject("SELECT system_code FROM sys_menu WHERE id = 103", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE role_id = 2 AND system_code = 'i18n'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system WHERE dept_id = 7 AND system_code = 'i18n'", Integer.class));
        assertTrue(tracker.isApplied(SystemPortalSchemaInitializer.V_TRANSLATION_SYSTEM));

        // 模拟菜单配置页把子菜单归属改回 platform → 重跑自愈回 i18n，且不产生重复准入记录
        jdbc.update("UPDATE sys_menu SET system_code = 'platform' WHERE id = 102");
        initializer.reconcileTranslationSystem();
        assertEquals("i18n", jdbc.queryForObject("SELECT system_code FROM sys_menu WHERE id = 102", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE role_id = 2 AND system_code = 'i18n'", Integer.class));
    }
}

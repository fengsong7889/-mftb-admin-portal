package com.mftb.admin.config;

import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 隔离内存库验证菜单归属修复与授权保留，不连接开发或生产数据库。 */
class SystemPortalSchemaInitializerTest {
    private static final String VERSION = SystemPortalSchemaInitializer.V_AI_MENU_OWNERSHIP;
    private static final String ROOT_UPDATE = "UPDATE sys_menu SET system_code = ? WHERE menu_key = 'ai-assistant' ";
    private JdbcTemplate jdbc;
    private SchemaVersionTracker tracker;
    private SystemPortalSchemaInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = spy(new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:ai_menu_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "")));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT AUTO_INCREMENT PRIMARY KEY, parent_id BIGINT, "
                + "menu_key VARCHAR(100) UNIQUE, name VARCHAR(100), type INT DEFAULT 2, "
                + "sort_order INT DEFAULT 1, status INT DEFAULT 1, deleted INT DEFAULT 0, "
                + "system_code VARCHAR(32), updated_by VARCHAR(64))");
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, system_code) VALUES "
                + "(1, NULL, 'ai-assistant', '自定义 AI 中心', NULL), "
                + "(2, 1, 'ai-models', '模型管理', NULL), "
                + "(3, 2, 'ai-model-list', '模型接入', ''), "
                + "(4, 1, 'ai_usage_stats', '能耗统计', 'ai'), "
                + "(5, NULL, 'finance', '财务', 'finance'), "
                + "(6, 5, 'finance-child', '财务子菜单', NULL), "
                + "(7, 1, 'cross-system', '显式跨系统目录', 'iam'), "
                + "(8, 7, 'cross-child', '跨系统子菜单', NULL), "
                + "(9, 1, 'ai-deleted', '已删除菜单', NULL), "
                + "(10, NULL, 'unknown-root', '未知根', NULL)");
        jdbc.update("UPDATE sys_menu SET deleted = 1 WHERE id = 9");
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64))");
        jdbc.execute("INSERT INTO sys_role VALUES (1, 'admin'), (2, 'reader')");
        jdbc.execute("CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (role_id, menu_id))");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, 3, '[\"view\"]')");
        jdbc.execute("CREATE TABLE sys_department_menu (dept_id BIGINT, menu_id BIGINT, actions VARCHAR(255), "
                + "PRIMARY KEY (dept_id, menu_id))");
        jdbc.execute("INSERT INTO sys_department_menu VALUES (4, 3, '[\"view\",\"edit\"]')");
        jdbc.execute("CREATE TABLE sys_role_system (role_id BIGINT, system_code VARCHAR(32))");
        jdbc.execute("CREATE TABLE sys_department_system (dept_id BIGINT, system_code VARCHAR(32))");
        tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "ai-menu-test");
        tracker.isApplied(VERSION);
        jdbc.update("INSERT INTO sys_schema_version (version_key) VALUES ('core:system-portal:v1.0')");
        initializer = new SystemPortalSchemaInitializer(jdbc, tracker);
    }

    @AfterEach
    void tearDown() {
        if (jdbc != null) jdbc.execute("SHUTDOWN");
    }

    @Test
    void repairsRootAndDescendantsWithoutChangingIdsMetadataOrGrants() {
        var metadata = jdbc.queryForList("SELECT id, parent_id, menu_key, name, status, deleted FROM sys_menu ORDER BY id");
        var roleGrants = jdbc.queryForList("SELECT * FROM sys_role_menu");
        var departmentGrants = jdbc.queryForList("SELECT * FROM sys_department_menu");

        initializer.reconcileAiMenuOwnership();

        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE system_code = 'ai'", Integer.class));
        assertEquals(metadata, jdbc.queryForList("SELECT id, parent_id, menu_key, name, status, deleted FROM sys_menu ORDER BY id"));
        assertEquals(roleGrants, jdbc.queryForList("SELECT * FROM sys_role_menu"));
        assertEquals(departmentGrants, jdbc.queryForList("SELECT * FROM sys_department_menu"));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system", Integer.class));
        assertEquals("finance", owner(5));
        assertEquals("iam", owner(7));
        for (long id : new long[]{6, 8, 9, 10}) assertNull(owner(id));
        assertTrue(tracker.isApplied(VERSION));
        assertEquals("SUCCESS", jdbc.queryForObject("SELECT status FROM sys_schema_migration_log WHERE version_key = ?", String.class, VERSION));
    }

    @Test
    void repeatedStartupIsIdempotentAndRepairsLaterDrift() {
        initializer.reconcileAiMenuOwnership();
        var first = jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id");
        initializer.reconcileAiMenuOwnership();
        assertEquals(first, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));

        jdbc.update("UPDATE sys_menu SET system_code = NULL WHERE id IN (1, 2, 3)");
        initializer.reconcileAiMenuOwnership();
        assertEquals(first, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_schema_version WHERE version_key = ?", Integer.class, VERSION));
    }

    @Test
    void failedVerificationIsAuditedAndCanRetry() {
        doReturn(0).when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"));
        assertThrows(IllegalStateException.class, initializer::reconcileAiMenuOwnership);
        assertFalse(tracker.isApplied(VERSION));
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM sys_schema_migration_log WHERE version_key = ?", String.class, VERSION));

        doCallRealMethod().when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"));
        initializer.reconcileAiMenuOwnership();
        assertTrue(tracker.isApplied(VERSION));
    }

    @Test
    void databaseFailurePropagatesWithoutRecordingSuccess() {
        doThrow(new IllegalStateException("模拟更新失败")).when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"));
        assertThrows(IllegalStateException.class, initializer::reconcileAiMenuOwnership);
        assertFalse(tracker.isApplied(VERSION));
    }

    @Test
    void existingVersionStillVerifiesOwnership() {
        initializer.reconcileAiMenuOwnership();
        jdbc.update("UPDATE sys_menu SET system_code = NULL WHERE id = 1");
        doReturn(0).when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"));
        assertThrows(IllegalStateException.class, initializer::reconcileAiMenuOwnership);
    }

    @Test
    void menuSeedRetainsAiIdsOwnershipAndNonAdminGrants() {
        initializer.reconcileAiMenuOwnership();
        var original = jdbc.queryForList("SELECT * FROM sys_menu WHERE id IN (1, 2, 3) ORDER BY id");
        var roleGrants = jdbc.queryForList("SELECT * FROM sys_role_menu WHERE role_id = 2");
        var departmentGrants = jdbc.queryForList("SELECT * FROM sys_department_menu");
        var seeder = new DataInitializer(mock(SysUserMapper.class), mock(PasswordEncoder.class), jdbc, tracker);

        ReflectionTestUtils.invokeMethod(seeder, "seedSystemMenus");

        assertEquals(original, jdbc.queryForList("SELECT * FROM sys_menu WHERE id IN (1, 2, 3) ORDER BY id"));
        assertEquals(roleGrants, jdbc.queryForList("SELECT * FROM sys_role_menu WHERE role_id = 2"));
        assertEquals(departmentGrants, jdbc.queryForList("SELECT * FROM sys_department_menu"));
    }

    @Test
    void startupInvokesIndependentVerifiedRepairWithoutRerunningPortalDerivation() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, name VARCHAR(64), name_en VARCHAR(64), "
                + "description VARCHAR(255), icon VARCHAR(64), sort_order INT, status INT, deleted INT)");
        initializer.run();
        assertTrue(tracker.isApplied(VERSION));
        assertEquals("ai", owner(1));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system", Integer.class));
    }

    private void seedSellerMenus() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO sys_system (code) VALUES ('seller')");
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, system_code, type) VALUES "
                + "(20, NULL, 'seller-center', '商家工作台', 'seller', 1), "
                + "(21, 20, 'promotion-sales-config', '店铺随心推', 'seller', 2), "
                + "(30, NULL, 'promotion_tool', '旧店铺随心推', 'ads', 1), "
                + "(31, 30, 'promotion-report-group', '自定义报表分析', 'ads', 2), "
                + "(32, 31, 'promotion-report-overview', '数据概览', 'ads', 2), "
                + "(33, 31, 'promotion-report-order', '订单效果', 'ads', 2), "
                + "(34, 31, 'promotion-report-compare', '类型对比', 'ads', 2), "
                + "(40, NULL, 'merchant_promotion', '商家推广工具', 'ads', 1), "
                + "(41, 40, 'ad-sales', '广告销售', 'ads', 2)");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, 32, '[\"view\"]')");
        jdbc.execute("INSERT INTO sys_department_menu VALUES (4, 33, '[\"view\",\"export\"]')");
    }

    @Test
    void movesOnlyReportsKeepingPurchaseOtherAdsAndAllGrants() {
        seedSellerMenus();
        var purchase = jdbc.queryForList("SELECT * FROM sys_menu WHERE id = 21");
        var otherAds = jdbc.queryForList("SELECT * FROM sys_menu WHERE id IN (40, 41) ORDER BY id");
        var reportMetadata = jdbc.queryForList("SELECT id, menu_key, name, type, status, sort_order FROM sys_menu WHERE id BETWEEN 31 AND 34 ORDER BY id");
        var roleGrants = jdbc.queryForList("SELECT * FROM sys_role_menu ORDER BY role_id, menu_id");
        var deptGrants = jdbc.queryForList("SELECT * FROM sys_department_menu ORDER BY dept_id, menu_id");

        initializer.reconcileSellerReports();

        assertTrue(tracker.isApplied(SystemPortalSchemaInitializer.V_SELLER_REPORTS));
        assertEquals(20L, jdbc.queryForObject("SELECT parent_id FROM sys_menu WHERE id = 31", Long.class));
        for (long id : new long[]{31, 32, 33, 34}) assertEquals("seller", owner(id));
        assertEquals(0, jdbc.queryForObject("SELECT status FROM sys_menu WHERE id = 30", Integer.class));
        assertEquals(purchase, jdbc.queryForList("SELECT * FROM sys_menu WHERE id = 21"));
        assertEquals(otherAds, jdbc.queryForList("SELECT * FROM sys_menu WHERE id IN (40, 41) ORDER BY id"));
        assertEquals(reportMetadata, jdbc.queryForList("SELECT id, menu_key, name, type, status, sort_order FROM sys_menu WHERE id BETWEEN 31 AND 34 ORDER BY id"));
        assertEquals(roleGrants, jdbc.queryForList("SELECT * FROM sys_role_menu ORDER BY role_id, menu_id"));
        assertEquals(deptGrants, jdbc.queryForList("SELECT * FROM sys_department_menu ORDER BY dept_id, menu_id"));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system", Integer.class));
    }

    @Test
    void sellerReportMigrationIsIdempotentAndRepairsSeedDriftWithoutReenablingReports() {
        seedSellerMenus();
        jdbc.update("UPDATE sys_menu SET status = 0 WHERE id = 34");
        initializer.reconcileSellerReports();
        var expected = jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id");
        initializer.reconcileSellerReports();
        assertEquals(expected, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
        jdbc.update("UPDATE sys_menu SET system_code = 'ads', parent_id = 30 WHERE id = 31");
        jdbc.update("UPDATE sys_menu SET system_code = 'ads' WHERE id IN (32, 33, 34)");
        jdbc.update("UPDATE sys_menu SET status = 1 WHERE id = 30");
        initializer.reconcileSellerReports();
        assertEquals(expected, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
    }

    @Test
    void legacyMenuSeedDoesNotMoveSellerPurchaseOrReportsBackToAds() {
        seedSellerMenus();
        initializer.reconcileSellerReports();
        var expected = jdbc.queryForList("SELECT * FROM sys_menu WHERE id BETWEEN 20 AND 34 ORDER BY id");
        var seeder = new DataInitializer(mock(SysUserMapper.class), mock(PasswordEncoder.class), jdbc, tracker);
        ReflectionTestUtils.invokeMethod(seeder, "seedSystemMenus");
        initializer.reconcileSellerReports();
        assertEquals(expected, jdbc.queryForList("SELECT * FROM sys_menu WHERE id BETWEEN 20 AND 34 ORDER BY id"));
    }

    @Test
    void missingSellerDefersMigrationWithoutRecordingSuccess() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, deleted INT DEFAULT 0)");
        var before = jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id");
        initializer.reconcileSellerReports();
        assertFalse(tracker.isApplied(SystemPortalSchemaInitializer.V_SELLER_REPORTS));
        assertEquals(before, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
    }

    @Test
    void unmovedPurchaseStopsReportMigrationWithoutChangingPurchase() {
        seedSellerMenus();
        jdbc.update("UPDATE sys_menu SET parent_id = 30, system_code = 'ads' WHERE id = 21");
        var before = jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id");
        assertThrows(IllegalStateException.class, initializer::reconcileSellerReports);
        assertFalse(tracker.isApplied(SystemPortalSchemaInitializer.V_SELLER_REPORTS));
        assertEquals(before, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
    }

    @Test
    void reportPostValidationFailureIsAuditedAndRetries() {
        seedSellerMenus();
        doReturn(0).when(jdbc).update(anyString(), eq(31L), eq("seller"), eq("promotion-report-order"), eq(31L), eq("seller"));
        assertThrows(IllegalStateException.class, initializer::reconcileSellerReports);
        assertFalse(tracker.isApplied(SystemPortalSchemaInitializer.V_SELLER_REPORTS));
        assertEquals("FAILED", jdbc.queryForObject(
                "SELECT status FROM sys_schema_migration_log WHERE version_key = ?", String.class, SystemPortalSchemaInitializer.V_SELLER_REPORTS));
        doCallRealMethod().when(jdbc).update(anyString(), eq(31L), eq("seller"), eq("promotion-report-order"), eq(31L), eq("seller"));
        initializer.reconcileSellerReports();
        assertTrue(tracker.isApplied(SystemPortalSchemaInitializer.V_SELLER_REPORTS));
    }

    @Test
    void unexpectedOldChildrenAreNotSilentlyHidden() {
        seedSellerMenus();
        jdbc.update("INSERT INTO sys_menu (id, parent_id, menu_key, name, system_code) VALUES (35, 30, 'custom-report', '其他报表', 'ads')");
        assertThrows(IllegalStateException.class, initializer::reconcileSellerReports);
        assertEquals(1, jdbc.queryForObject("SELECT status FROM sys_menu WHERE id = 30", Integer.class));
        assertFalse(tracker.isApplied(SystemPortalSchemaInitializer.V_SELLER_REPORTS));
    }

    private String owner(long id) {
        return jdbc.queryForObject("SELECT system_code FROM sys_menu WHERE id = ?", String.class, id);
    }
}

package com.mftb.admin.config;

import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 隔离内存库验证菜单归属修复与授权保留，不连接开发或生产数据库。 */
class SystemPortalSchemaInitializerTest {
    private static final String VERSION = SystemPortalSchemaInitializer.V_AI_MENU_OWNERSHIP;
    // v45: ai-assistant 壳已退役，归属修复逐个作用于 AI 顶级菜单
    private static final String ROOT_UPDATE =
            "UPDATE sys_menu SET system_code = ? WHERE menu_key = ? AND parent_id IS NULL ";
    private JdbcTemplate jdbc;
    private SchemaVersionTracker tracker;
    private SystemPortalSchemaInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = spy(new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:ai_menu_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "")));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT AUTO_INCREMENT PRIMARY KEY, parent_id BIGINT, "
                + "menu_key VARCHAR(100) UNIQUE, name VARCHAR(100), name_en VARCHAR(100), path VARCHAR(200), "
                + "icon VARCHAR(100), type INT DEFAULT 2, "
                + "sort_order INT DEFAULT 1, actions VARCHAR(255), status INT DEFAULT 1, deleted INT DEFAULT 0, "
                + "system_code VARCHAR(32), updated_by VARCHAR(64))");
        // v45 扁平结构：ai-assistant 壳已退役，ai-models 等直接挂顶级；
        // ai-models 缺归属待修复，ai-model-list 作为后代待继承，ai_usage_stats 已正确。
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, system_code) VALUES "
                + "(2, NULL, 'ai-models', '模型管理', NULL), "
                + "(3, 2, 'ai-model-list', '模型接入', ''), "
                + "(4, NULL, 'ai_usage_stats', '能耗统计', 'ai'), "
                + "(5, NULL, 'finance', '财务', 'finance'), "
                + "(6, 5, 'finance-child', '财务子菜单', NULL), "
                + "(7, NULL, 'cross-system', '显式跨系统目录', 'iam'), "
                + "(8, 7, 'cross-child', '跨系统子菜单', NULL), "
                + "(9, 2, 'ai-deleted', '已删除菜单', NULL), "
                + "(10, NULL, 'unknown-root', '未知根', NULL)");
        jdbc.update("UPDATE sys_menu SET deleted = 1 WHERE id = 9");
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), deleted INT DEFAULT 0, status INT DEFAULT 1)");
        jdbc.execute("INSERT INTO sys_role (id, code) VALUES (1, 'admin'), (2, 'reader')");
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

        // ai-models（顶级填空）+ ai-model-list（后代继承）+ ai_usage_stats（已正确）
        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE system_code = 'ai'", Integer.class));
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

        jdbc.update("UPDATE sys_menu SET system_code = NULL WHERE id IN (2, 3)");
        initializer.reconcileAiMenuOwnership();
        assertEquals(first, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_schema_version WHERE version_key = ?", Integer.class, VERSION));
    }

    @Test
    void failedVerificationIsAuditedAndCanRetry() {
        doReturn(0).when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"), anyString());
        assertThrows(IllegalStateException.class, initializer::reconcileAiMenuOwnership);
        assertFalse(tracker.isApplied(VERSION));
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM sys_schema_migration_log WHERE version_key = ?", String.class, VERSION));

        doCallRealMethod().when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"), anyString());
        initializer.reconcileAiMenuOwnership();
        assertTrue(tracker.isApplied(VERSION));
    }

    @Test
    void databaseFailurePropagatesWithoutRecordingSuccess() {
        doThrow(new IllegalStateException("模拟更新失败")).when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"), anyString());
        assertThrows(IllegalStateException.class, initializer::reconcileAiMenuOwnership);
        assertFalse(tracker.isApplied(VERSION));
    }

    @Test
    void existingVersionStillVerifiesOwnership() {
        initializer.reconcileAiMenuOwnership();
        jdbc.update("UPDATE sys_menu SET system_code = NULL WHERE id = 2");
        doReturn(0).when(jdbc).update(startsWith(ROOT_UPDATE), eq("ai"), anyString());
        assertThrows(IllegalStateException.class, initializer::reconcileAiMenuOwnership);
    }

    @Test
    void menuSeedRetainsAiIdsOwnershipAndNonAdminGrants() {
        initializer.reconcileAiMenuOwnership();
        var original = jdbc.queryForList("SELECT * FROM sys_menu WHERE id IN (2, 3) ORDER BY id");
        var roleGrants = jdbc.queryForList("SELECT * FROM sys_role_menu WHERE role_id = 2");
        var departmentGrants = jdbc.queryForList("SELECT * FROM sys_department_menu");
        var seeder = new DataInitializer(mock(SysUserMapper.class), mock(PasswordEncoder.class), jdbc, tracker,
                mock(com.mftb.admin.service.PermissionService.class));

        ReflectionTestUtils.invokeMethod(seeder, "seedSystemMenus");

        // 种子重跑只允许按结构对齐 parent_id，ID / 名称 / 归属 / 非 admin 授权必须原样保留
        assertEquals(original, jdbc.queryForList("SELECT * FROM sys_menu WHERE id IN (2, 3) ORDER BY id"));
        assertEquals(roleGrants, jdbc.queryForList("SELECT * FROM sys_role_menu WHERE role_id = 2"));
        assertEquals(departmentGrants, jdbc.queryForList("SELECT * FROM sys_department_menu"));
    }

    @Test
    void startupInvokesIndependentVerifiedRepairWithoutRerunningPortalDerivation() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, name VARCHAR(64), name_en VARCHAR(64), "
                + "description VARCHAR(255), icon VARCHAR(64), sort_order INT, status INT, deleted INT)");
        // 广告系统内的店铺随心推现状（拆分前生产形态）
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, type, system_code) VALUES "
                + "(11, NULL, 'promotion_tool', '推廣通', 1, 'ads'), "
                + "(12, 11, 'promotion-sales-config', '店鋪推廣', 2, 'ads'), "
                + "(13, 11, 'promotion-report-group', '報表分析', 1, 'ads'), "
                + "(14, 13, 'promotion-report-overview', '數據概覽', 2, 'ads'), "
                + "(15, 13, 'promotion-report-order', '訂單效果', 2, 'ads'), "
                + "(16, 13, 'promotion-report-compare', '類型對比', 2, 'ads'), "
                + "(17, NULL, 'i18n-center', '多語言管理', 1, 'platform'), "
                + "(18, 17, 'translation-manage', '翻譯工作台', 2, 'platform')");
        jdbc.execute("INSERT INTO sys_role_menu VALUES (2, 14, '[\"view\"]'), (2, 18, '[\"view\",\"edit\"]')");
        jdbc.execute("INSERT INTO sys_department_menu VALUES (4, 15, '[\"view\",\"export\"]')");
        initializer.run();
        assertTrue(tracker.isApplied(VERSION));
        // v45: ai-assistant 壳已退役，AI 归属锚点是顶级菜单 ai-models(id=2)
        assertEquals("ai", owner(2));
        // 商家工作台全链路（v45 扁平结构）：seedSystems 落 seller 系统行 → 购买入口与报表分析组
        // 直接成为 seller 顶级菜单 → 报表叶子归位到报表分析组下。
        // 不再创建 seller-center 壳，也不再停用 promotion_tool（壳由 DataInitializer 统一退役）。
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_system WHERE code = 'seller' AND status = 1", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'seller-center'", Integer.class));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key IN "
                + "('promotion-sales-config', 'promotion-report-group') AND parent_id IS NULL "
                + "AND system_code = 'seller'", Integer.class));
        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key IN "
                + "('promotion-report-overview', 'promotion-report-order', 'promotion-report-compare') "
                + "AND system_code = 'seller' AND parent_id = 13", Integer.class));
        // 准入反推：持有随心推报表授权的角色/部门获得 seller；不重跑 v1.0 全量推导（ai 菜单无授权记录）
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE system_code = 'seller' AND role_id = 2", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_department_system WHERE system_code = 'seller' AND dept_id = 4", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE system_code = 'ai'", Integer.class));
        // 翻译中心独立系统：i18n 行落库 + 顶级入口脱离 platform + 准入反推
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_system WHERE code = 'i18n' AND status = 1", Integer.class));
        // v45: i18n-center(id=17) 壳已退役，归属自愈只作用于真正的顶级入口 translation-manage(id=18)
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE id = 18 AND system_code = 'i18n'", Integer.class));
        assertEquals("platform", jdbc.queryForObject("SELECT system_code FROM sys_menu WHERE id = 17", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_system WHERE system_code = 'i18n' AND role_id = 2", Integer.class));
    }

    /**
     * 商家工作台现状夹具（v45 扁平结构）：购买入口与报表分析组都已是 seller 顶级菜单，
     * 报表叶子挂报表分析组下；promotion_tool 壳仍挂在 ads 侧，用于验证报表迁移不误伤它。
     */
    private void seedSellerMenus() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO sys_system (code) VALUES ('seller')");
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, system_code, type) VALUES "
                + "(21, NULL, 'promotion-sales-config', '店鋪隨心推', 'seller', 2), "
                + "(30, NULL, 'promotion_tool', '旧店铺随心推', 'ads', 1), "
                + "(31, NULL, 'promotion-report-group', '自定义报表分析', 'seller', 1), "
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
        // v45: 报表分析组保持 seller 顶级（不再挂回 seller-center），三个报表叶子归其下
        assertNull(jdbc.queryForObject("SELECT parent_id FROM sys_menu WHERE id = 31", Long.class));
        for (long id : new long[]{31, 32, 33, 34}) assertEquals("seller", owner(id));
        for (long id : new long[]{32, 33, 34}) {
            assertEquals(31L, jdbc.queryForObject("SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, id));
        }
        // 壳的状态不由本初始化器负责（退役在 DataInitializer），此处必须不被改写
        assertEquals(1, jdbc.queryForObject("SELECT status FROM sys_menu WHERE id = 30", Integer.class));
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
        // 漂移：报表叶子被挂回 ads 旧壳且归属被改回 ads
        jdbc.update("UPDATE sys_menu SET system_code = 'ads', parent_id = 30 WHERE id IN (32, 33, 34)");
        initializer.reconcileSellerReports();
        assertEquals(expected, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
    }

    @Test
    void legacyMenuSeedDoesNotMoveSellerPurchaseOrReportsBackToAds() {
        seedSellerMenus();
        initializer.reconcileSellerReports();
        var expected = jdbc.queryForList("SELECT * FROM sys_menu WHERE id BETWEEN 21 AND 34 ORDER BY id");
        var seeder = new DataInitializer(mock(SysUserMapper.class), mock(PasswordEncoder.class), jdbc, tracker,
                mock(com.mftb.admin.service.PermissionService.class));
        ReflectionTestUtils.invokeMethod(seeder, "seedSystemMenus");
        initializer.reconcileSellerReports();
        // v45: 种子已不再声明 seller-center / promotion_tool 父级，重跑不会把 seller 菜单搬回 ads
        assertEquals(expected, jdbc.queryForList("SELECT * FROM sys_menu WHERE id BETWEEN 21 AND 34 ORDER BY id"));
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
    void reportGroupNotOwnedBySellerStopsMigrationWithoutChanges() {
        // v45: 「购买入口必须已迁入 seller-center」的前置已随壳退役删除；
        //      新的守卫是「报表分析组必须已归属 seller」，否则 requireMenuId 直接中止，
        //      避免把 ads 侧同名菜单误改归属。
        seedSellerMenus();
        jdbc.update("DELETE FROM sys_menu WHERE id = 31");
        jdbc.update("DELETE FROM sys_role_menu WHERE menu_id = 32");
        jdbc.update("DELETE FROM sys_department_menu WHERE menu_id = 33");
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
    void retiredWrapperPromotesEveryChildIncludingUnknownOnes() {
        // 退役壳时必须提升「全部」子菜单，包括种子未知的自定义菜单——
        // 否则它们会随壳一起消失（旧实现靠抛异常阻止，现由提升兜住）。
        seedSellerMenus();
        jdbc.execute("INSERT INTO sys_menu (id, parent_id, menu_key, name, system_code) VALUES "
                + "(35, 30, 'custom-report', '其他报表', 'ads')");
        var seeder = new DataInitializer(mock(SysUserMapper.class), mock(PasswordEncoder.class), jdbc, tracker,
                mock(com.mftb.admin.service.PermissionService.class));

        ReflectionTestUtils.invokeMethod(seeder, "retireSystemWrapperDirectories");

        // promotion-report-group(31) 与 promotion_tool(30) 都在退役清单里：壳被物理删除，
        // 其下所有子菜单（含自定义的 35）提升为顶级，且不产生悬空 parent_id
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'promotion_tool'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE id = 35 AND parent_id IS NULL", Integer.class));
        // 存活行不得留下悬空 parent_id；软删残留保留原父级是合理的（它本来就不在菜单树里）
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_menu c LEFT JOIN sys_menu p ON c.parent_id = p.id "
                        + "WHERE c.parent_id IS NOT NULL AND c.deleted = 0 AND p.id IS NULL", Integer.class));
    }

    /**
     * 系统名称真值锁定：sys_system 种子必须逐字等于企业门户的语言包口径。
     * <p>表内容与 src/i18n/locales/zh-TW.json 的 portal.systems.*.name 一一对应，
     * 前端 src/constants/portalSystems.test.ts 锁同一张表；任一侧改名都必须同步另一侧。
     */
    @Test
    void seedSystemsMatchesPortalAuthoritativeNames() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, name VARCHAR(64) NOT NULL, "
                + "name_en VARCHAR(64), description VARCHAR(255), icon VARCHAR(64), "
                + "sort_order INT NOT NULL DEFAULT 0, status INT DEFAULT 1, deleted INT DEFAULT 0, "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        ReflectionTestUtils.invokeMethod(initializer, "seedSystems");

        Map<String, String> authoritative = Map.ofEntries(
                Map.entry("ads", "廣告推薦系統"),
                Map.entry("merchant", "商戶運營系統"),
                Map.entry("seller", "店鋪經營系統"),
                Map.entry("search", "搜索運營系統"),
                Map.entry("finance", "財務結算系統"),
                Map.entry("ai", "人工智能系統"),
                Map.entry("hr", "人力資源系統"),
                Map.entry("eam", "物資管理系統"),
                Map.entry("rdm", "產研協同系統"),
                Map.entry("oa", "協同辦公系統"),
                Map.entry("iam", "權限管理系統"),
                Map.entry("platform", "平台支撐系統"),
                Map.entry("i18n", "翻譯管理系統"));
        assertEquals(authoritative.size(),
                jdbc.queryForObject("SELECT COUNT(*) FROM sys_system WHERE deleted = 0", Integer.class));
        authoritative.forEach((code, name) -> assertEquals(name,
                jdbc.queryForObject("SELECT name FROM sys_system WHERE code = ?", String.class, code),
                "系统 " + code + " 的名称必须等于企业门户口径"));
    }

    /**
     * 系统名称不开放人工修改：即使有人直接改库，每次启动的种子也会刷回真值。
     * <p>这是「人工不能自主改系统名称」的服务端保证——sys_system 没有任何写接口，
     * 唯一改名途径是改 {@code seedSystems()} 并同步语言包。
     */
    @Test
    void manualSystemRenameIsHealedOnNextStartup() {
        jdbc.execute("CREATE TABLE sys_system (code VARCHAR(32) PRIMARY KEY, name VARCHAR(64) NOT NULL, "
                + "name_en VARCHAR(64), description VARCHAR(255), icon VARCHAR(64), "
                + "sort_order INT NOT NULL DEFAULT 0, status INT DEFAULT 1, deleted INT DEFAULT 0, "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        ReflectionTestUtils.invokeMethod(initializer, "seedSystems");

        // 模拟 DBA 手工把人力资源系统改成别的写法，并停用某系统
        jdbc.update("UPDATE sys_system SET name = 'HR 系統' WHERE code = 'hr'");
        jdbc.update("UPDATE sys_system SET status = 0 WHERE code = 'oa'");

        ReflectionTestUtils.invokeMethod(initializer, "seedSystems");

        assertEquals("人力資源系統",
                jdbc.queryForObject("SELECT name FROM sys_system WHERE code = 'hr'", String.class));
        // 种子只刷新展示元数据，不越权改 status（停用是运维决策，不是漂移）
        assertEquals(0, jdbc.queryForObject("SELECT status FROM sys_system WHERE code = 'oa'", Integer.class));
    }

    private String owner(long id) {
        return jdbc.queryForObject("SELECT system_code FROM sys_menu WHERE id = ?", String.class, id);
    }
}

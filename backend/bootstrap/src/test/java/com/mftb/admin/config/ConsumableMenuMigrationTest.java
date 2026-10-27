package com.mftb.admin.config;

import com.mftb.admin.util.BizSeqService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 仅在隔离内存库验证旧菜单收敛；不执行历史 EAM 迁移，不连接开发或生产数据库。 */
class ConsumableMenuMigrationTest {
    private static final String VERSION = ConsumableSchemaInitializer.V_RETIRE_LEGACY_MENUS;
    private static final String RETIRE_PREFIX = "UPDATE sys_menu SET deleted = 1, status = 0";
    private JdbcTemplate jdbc;
    private SchemaVersionTracker tracker;
    private ConsumableSchemaInitializer initializer;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource("jdbc:h2:mem:consumable_menu_" + UUID.randomUUID()
                + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = spy(new JdbcTemplate(dataSource));
        jdbc.execute("CREATE TABLE sys_menu (id BIGINT PRIMARY KEY, menu_key VARCHAR(100) UNIQUE, "
                + "name VARCHAR(100), status INT NOT NULL, deleted INT NOT NULL, updated_by VARCHAR(64))");
        jdbc.execute("INSERT INTO sys_menu VALUES "
                + "(1, 'consumable-category', '耗材分类管理', 1, 0, 'admin'), "
                + "(2, 'consumable-brand', '耗材品牌管理', 0, 0, 'admin'), "
                + "(3, 'consumable-unit', '计量单位管理', 1, 1, 'admin'), "
                + "(4, 'asset-category', '分类库', 1, 0, 'admin'), "
                + "(5, 'asset-model', '品牌产品库', 1, 0, 'admin')");
        jdbc.execute("CREATE TABLE biz_eam_category (id BIGINT PRIMARY KEY, name VARCHAR(100))");
        jdbc.execute("INSERT INTO biz_eam_category VALUES (1, '保留业务分类')");
        tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "consumable-menu-test");
        tracker.isApplied(VERSION);
        initializer = new ConsumableSchemaInitializer(jdbc, tracker, mock(BizSeqService.class));
    }

    @AfterEach
    void tearDown() {
        if (jdbc != null) jdbc.execute("SHUTDOWN");
    }

    @Test
    void retiresOnlyLegacyMenusEvenWhenEamV8WasAlreadyApplied() {
        jdbc.update("INSERT INTO sys_schema_version (version_key) VALUES (?)", "eam:schema-v8-merge-category-brand");

        initializer.reconcileLegacyConsumableMenus();

        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE deleted = 1 AND status = 0", Integer.class));
        assertEquals(5, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu", Integer.class), "菜单记录不能物理删除");
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE id IN (4, 5) AND deleted = 0 AND status = 1", Integer.class));
        assertEquals("保留业务分类", jdbc.queryForObject("SELECT name FROM biz_eam_category WHERE id = 1", String.class));
        assertTrue(tracker.isApplied(VERSION));
        assertEquals("SUCCESS", jdbc.queryForObject("SELECT status FROM sys_schema_migration_log WHERE version_key = ?", String.class, VERSION));
    }

    @Test
    void repeatedStartupIsIdempotent() {
        initializer.reconcileLegacyConsumableMenus();
        var first = jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id");

        initializer.reconcileLegacyConsumableMenus();

        assertEquals(first, jdbc.queryForList("SELECT * FROM sys_menu ORDER BY id"));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_schema_version WHERE version_key = ?", Integer.class, VERSION));
    }

    @Test
    void healsRevivedMenuDespiteExistingVersionRecord() {
        initializer.reconcileLegacyConsumableMenus();
        jdbc.update("UPDATE sys_menu SET deleted = 0, status = 1 WHERE menu_key = 'consumable-brand'");

        initializer.reconcileLegacyConsumableMenus();

        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE deleted = 1 AND status = 0", Integer.class));
        assertTrue(tracker.isApplied(VERSION));
    }

    @Test
    void failedVerificationDoesNotRecordSuccessAndCanRetry() {
        doReturn(0).when(jdbc).update(startsWith(RETIRE_PREFIX));

        assertThrows(IllegalStateException.class, initializer::reconcileLegacyConsumableMenus);
        assertFalse(tracker.isApplied(VERSION));
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM sys_schema_migration_log WHERE version_key = ?", String.class, VERSION));

        doCallRealMethod().when(jdbc).update(startsWith(RETIRE_PREFIX));
        initializer.reconcileLegacyConsumableMenus();
        assertTrue(tracker.isApplied(VERSION));
    }

    @Test
    void databaseFailurePropagatesWithoutRecordingVersion() {
        doThrow(new IllegalStateException("模拟菜单更新失败")).when(jdbc).update(startsWith(RETIRE_PREFIX));

        assertThrows(IllegalStateException.class, initializer::reconcileLegacyConsumableMenus);
        assertFalse(tracker.isApplied(VERSION));
    }

    @Test
    void existingVersionDoesNotSuppressVerificationFailure() {
        initializer.reconcileLegacyConsumableMenus();
        jdbc.update("UPDATE sys_menu SET deleted = 0, status = 1 WHERE id = 1");
        doReturn(0).when(jdbc).update(startsWith(RETIRE_PREFIX));

        assertThrows(IllegalStateException.class, initializer::reconcileLegacyConsumableMenus);
    }

    @Test
    void startupUsesIndependentVerifiedMigrationWithoutRerunningEam() {
        var mockJdbc = mock(JdbcTemplate.class);
        when(mockJdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(0);
        var mockTracker = mock(SchemaVersionTracker.class);
        var runner = new ConsumableSchemaInitializer(mockJdbc, mockTracker, mock(BizSeqService.class));

        runner.run();

        verify(mockTracker).applyOnce(eq(VERSION), any(Runnable.class), any(Runnable.class));
        verify(mockTracker, never()).applyOnce(eq("eam:schema-v8-merge-category-brand"), any(Runnable.class));
        verify(mockJdbc, never()).execute(anyString());
    }
}

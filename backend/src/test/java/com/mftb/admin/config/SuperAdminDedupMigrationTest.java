package com.mftb.admin.config;

import com.mftb.admin.service.PermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 隔离内存库验证超级管理员收敛：非内置账号移除 admin 角色绑定、内置超管与其他角色不受影响、缓存全局失效。 */
class SuperAdminDedupMigrationTest {

    private JdbcTemplate jdbc;
    private DataInitializer initializer;
    private PermissionService permissionService;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:superadmin_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO sys_role VALUES (1, 'admin', 0), (2, 'hr', 0), (3, 'deleted-role', 1)");
        jdbc.execute("CREATE TABLE sys_user (id BIGINT PRIMARY KEY, username VARCHAR(64), name VARCHAR(64), "
                + "role VARCHAR(32), function_roles VARCHAR(255), deleted INT DEFAULT 0, updated_by VARCHAR(64))");
        // 内置超管 + 3 个误绑 admin 的普通账号（其一同时持有其他角色）+ 1 个正常账号 + 1 个已删除误绑账号
        jdbc.execute("INSERT INTO sys_user (id, username, name, role, function_roles) VALUES "
                + "(1, 'MF00001', '超级管理员', 'admin', '[1]'), "
                + "(2, 'MF00002', '员工A', 'user', '[1]'), "
                + "(3, 'MF00003', '员工B', 'user', '[1,2]'), "
                + "(4, 'MF00004', '员工C', 'user', '[ 1 , 2 ]'), "
                + "(5, 'MF00005', '员工D', 'user', '[2]'), "
                + "(6, 'MF00006', '员工E', 'user', '[1]')");
        jdbc.update("UPDATE sys_user SET deleted = 1 WHERE id = 6");
        SchemaVersionTracker tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "super-admin-dedup-test");
        permissionService = mock(PermissionService.class);
        initializer = new DataInitializer(mock(com.mftb.admin.mapper.SysUserMapper.class),
                mock(PasswordEncoder.class), jdbc, tracker, permissionService);
    }

    @Test
    void dedupsAdminBindingOnlyOnNonBuiltinAccountsAndEvictsCache() {
        ReflectionTestUtils.invokeMethod(initializer, "dedupSuperAdminBindings");

        // 内置超管不动
        assertEquals("[1]", jdbc.queryForObject(
                "SELECT function_roles FROM sys_user WHERE id = 1", String.class));
        // 仅剩 admin 绑定的置空；混合绑定只移除 1 保留其他角色（保持原 JSON 元素类型）
        assertNull(jdbc.queryForObject("SELECT function_roles FROM sys_user WHERE id = 2", String.class));
        assertEquals("[2]", jdbc.queryForObject("SELECT function_roles FROM sys_user WHERE id = 3", String.class));
        assertEquals("[2]", jdbc.queryForObject("SELECT function_roles FROM sys_user WHERE id = 4", String.class));
        // 未绑定 admin 的账号零改动（updated_by 不被误写）
        assertEquals("[2]", jdbc.queryForObject("SELECT function_roles FROM sys_user WHERE id = 5", String.class));
        assertNull(jdbc.queryForObject("SELECT updated_by FROM sys_user WHERE id = 5", String.class));
        // 已删除账号不处理
        assertEquals("[1]", jdbc.queryForObject("SELECT function_roles FROM sys_user WHERE id = 6", String.class));
        // 有清理时必须全局失效缓存（evictAll 内含 revision bump，多副本实例自动重载）
        verify(permissionService).evictAll();
    }

    @Test
    void verifyPassesAfterDedupAndFailsOnDirtyData() {
        assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "verifySuperAdminDedup"));

        ReflectionTestUtils.invokeMethod(initializer, "dedupSuperAdminBindings");
        ReflectionTestUtils.invokeMethod(initializer, "verifySuperAdminDedup");

        // 新脏数据出现（旁路复发）→ 校验再次失败，不记录版本
        jdbc.update("UPDATE sys_user SET function_roles = '[1,2]' WHERE id = 5");
        assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "verifySuperAdminDedup"));
    }

    @Test
    void rerunIsIdempotentAndSkipsEvictWhenClean() {
        ReflectionTestUtils.invokeMethod(initializer, "dedupSuperAdminBindings");
        verify(permissionService).evictAll();

        // 二次运行无残留 → 不再触发 evictAll，数据不变
        ReflectionTestUtils.invokeMethod(initializer, "dedupSuperAdminBindings");
        verifyNoMoreInteractions(permissionService);
        assertNull(jdbc.queryForObject("SELECT function_roles FROM sys_user WHERE id = 2", String.class));
    }
}

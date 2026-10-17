package com.mftb.admin.config;

import com.mftb.admin.config.migration.MigrationCatalog;
import com.mftb.admin.config.migration.MigrationEntry;
import com.mftb.admin.config.migration.SchemaPhase;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.service.PermissionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 内置系统管理员账号迁移（{@code core:builtin-admin-account-v1}）测试。
 * <p>
 * 钉住四条不可退让的口径：
 * <ol>
 *   <li><b>先建后降</b>：任何时刻都存在唯一可用的超管，绝不出现「MF00001 已降级但 admin 没建起来」的锁死态；</li>
 *   <li><b>降级要彻底</b>：不仅改 {@code sys_user.role}，还要剥离 function_roles 里的 admin 角色绑定，
 *       否则仍走「绑定超管角色」这条直通路径（{@code PermissionServiceImpl.load}）；</li>
 *   <li><b>不新增硬编码密钥</b>：存量库继承超管的 BCrypt 哈希，只有全新库的占位符才用引导密码兜底；</li>
 *   <li><b>系统账号不被工号迁移吞掉</b>：{@code migrateEmpIdToMF()} 每次启动执行，
 *       未排除 {@code admin} 会在下次重启把它改名成 MFxxxxx —— 这正是历史上 admin 变成 MF00001 的原因。</li>
 * </ol>
 */
class BuiltinAdminAccountMigrationTest {

    /** 合法 BCrypt 形态（$2 前缀 + 长度 >= 60）；测试只关心「是否被识别为真实密码」，不做真实校验 */
    private static final String VALID_HASH = "$2a$10$" + "x".repeat(53);
    /** 01_init_system.sql 里的占位符：形态不合法，必须被引导密码覆盖 */
    private static final String PLACEHOLDER_HASH = "$2a$10$placeholder";
    private static final String BOOTSTRAP_ENCODED = "$2a$10$" + "b".repeat(53);

    private JdbcTemplate jdbc;
    private DataInitializer initializer;
    private PermissionService permissionService;

    private void setUpSchema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:builtinadmin_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE sys_role (id BIGINT PRIMARY KEY, code VARCHAR(64), status INT DEFAULT 1, "
                + "deleted INT DEFAULT 0)");
        jdbc.execute("INSERT INTO sys_role VALUES (1, 'admin', 1, 0), (2, 'hr', 1, 0)");
        jdbc.execute("CREATE TABLE sys_user (id BIGINT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(64), "
                + "password VARCHAR(255), name VARCHAR(64), emp_id VARCHAR(32), avatar VARCHAR(64), "
                + "role VARCHAR(32), function_roles VARCHAR(255), department VARCHAR(64), department_id BIGINT, "
                + "position VARCHAR(64), position_id BIGINT, status INT DEFAULT 1, deleted INT DEFAULT 0, "
                + "must_change_password TINYINT DEFAULT 0, updated_by VARCHAR(64))");
        SchemaVersionTracker tracker = new SchemaVersionTracker(jdbc);
        ReflectionTestUtils.setField(tracker, "buildTag", "builtin-admin-test");
        permissionService = mock(PermissionService.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenReturn(BOOTSTRAP_ENCODED);
        initializer = new DataInitializer(mock(com.mftb.admin.mapper.SysUserMapper.class),
                encoder, jdbc, tracker, permissionService);
    }

    /** 存量库：MF00001 是当前超管，且 function_roles 里还绑着 admin 角色（双重直通路径） */
    private void seedLegacyDb() {
        jdbc.execute("INSERT INTO sys_user (username, password, name, emp_id, avatar, role, function_roles, "
                + "department, department_id, position, status) VALUES "
                + "('MF00001', '" + VALID_HASH + "', 'Bee', 'MF00001', 'pikachu-default', 'admin', '[1,2]', "
                + "'集團總裁辦', 10, '高級副總裁', 1), "
                + "('MF00002', '" + VALID_HASH + "', '員工A', 'MF00002', 'pikachu-default', 'guest', '[2]', "
                + "'財務部', 11, '會計', 1)");
    }

    /** 全新库：01_init_system.sql 种子的 admin 行（占位密码 + 带工号 + 带部门职位） */
    private void seedFreshDb() {
        jdbc.execute("INSERT INTO sys_user (username, password, name, emp_id, avatar, role, department, position, "
                + "status) VALUES ('admin', '" + PLACEHOLDER_HASH + "', 'Bee', 'SF0001', 'pikachu-default', "
                + "'admin', '集团总裁办', '高级副总裁', 1)");
    }

    private void migrate() {
        ReflectionTestUtils.invokeMethod(initializer, "migrateBuiltinAdminAccount");
    }

    private void verifyMigration() {
        ReflectionTestUtils.invokeMethod(initializer, "verifyBuiltinAdminAccount");
    }

    @Test
    @DisplayName("存量库：建独立 admin 账号（继承超管密码哈希）并把 MF00001 降级为普通账号")
    void createsAdminAccountAndDemotesLegacySuperAdmin() {
        setUpSchema();
        seedLegacyDb();

        migrate();

        // 新系统账号：超管 + 启用 + 无工号/部门/职位 + 强制首登改密
        assertEquals("admin", jdbc.queryForObject(
                "SELECT role FROM sys_user WHERE username = 'admin'", String.class));
        assertEquals(1, jdbc.queryForObject(
                "SELECT status FROM sys_user WHERE username = 'admin'", Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "SELECT deleted FROM sys_user WHERE username = 'admin'", Integer.class));
        assertNull(jdbc.queryForObject("SELECT emp_id FROM sys_user WHERE username = 'admin'", String.class),
                "系统账号不占员工工号序列");
        assertEquals(BuiltinAccounts.ADMIN_DISPLAY_NAME, jdbc.queryForObject(
                "SELECT name FROM sys_user WHERE username = 'admin'", String.class));
        assertEquals(1, jdbc.queryForObject(
                "SELECT must_change_password FROM sys_user WHERE username = 'admin'", Integer.class),
                "继承的密码与 MF00001 相同，必须强制首登改密以关闭共用密码窗口");
        // 密码继承存量超管哈希：不新增硬编码密钥，当前管理员用原密码即可接管
        assertEquals(VALID_HASH, jdbc.queryForObject(
                "SELECT password FROM sys_user WHERE username = 'admin'", String.class));

        // MF00001 降级为普通账号，但仍是可用员工（姓名/工号/部门不动）
        assertEquals("guest", jdbc.queryForObject(
                "SELECT role FROM sys_user WHERE username = 'MF00001'", String.class));
        assertEquals("Bee", jdbc.queryForObject(
                "SELECT name FROM sys_user WHERE username = 'MF00001'", String.class));
        assertEquals("MF00001", jdbc.queryForObject(
                "SELECT emp_id FROM sys_user WHERE username = 'MF00001'", String.class));
        // 降级必须彻底：function_roles 里的 admin 角色被剥离，否则仍超管直通
        assertEquals("[2]", jdbc.queryForObject(
                "SELECT function_roles FROM sys_user WHERE username = 'MF00001'", String.class));
        // 无关员工零改动
        assertEquals("[2]", jdbc.queryForObject(
                "SELECT function_roles FROM sys_user WHERE username = 'MF00002'", String.class));

        // 存活超管唯一
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE LOWER(role) = 'admin' AND deleted = 0", Integer.class));
        // 降级改变权限判定结果，必须全局失效缓存
        verify(permissionService, atLeastOnce()).evictAll();
        assertDoesNotThrow(this::verifyMigration);
    }

    @Test
    @DisplayName("重复执行幂等：不新增账号、不改已继承的密码、不反复降级")
    void rerunIsIdempotent() {
        setUpSchema();
        seedLegacyDb();

        migrate();
        migrate();

        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE username = 'admin'", Integer.class));
        assertEquals(VALID_HASH, jdbc.queryForObject(
                "SELECT password FROM sys_user WHERE username = 'admin'", String.class),
                "第二次执行不得覆盖密码（否则管理员改过的密码会被抹掉）");
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE LOWER(role) = 'admin' AND deleted = 0", Integer.class));
        assertDoesNotThrow(this::verifyMigration);
    }

    @Test
    @DisplayName("全新库：占位密码被引导密码覆盖，工号/部门/职位归一为系统账号口径")
    void normalizesSeededAdminAndBootstrapsPassword() {
        setUpSchema();
        seedFreshDb();

        migrate();

        assertEquals(BOOTSTRAP_ENCODED, jdbc.queryForObject(
                "SELECT password FROM sys_user WHERE username = 'admin'", String.class),
                "占位符不是合法 BCrypt，必须被引导密码覆盖，否则谁都登录不进来");
        assertEquals(1, jdbc.queryForObject(
                "SELECT must_change_password FROM sys_user WHERE username = 'admin'", Integer.class));
        assertNull(jdbc.queryForObject("SELECT emp_id FROM sys_user WHERE username = 'admin'", String.class),
                "种子数据里的 SF0001 工号必须清空");
        assertEquals(BuiltinAccounts.ADMIN_DISPLAY_NAME, jdbc.queryForObject(
                "SELECT name FROM sys_user WHERE username = 'admin'", String.class));
        assertNull(jdbc.queryForObject("SELECT department_id FROM sys_user WHERE username = 'admin'", Long.class),
                "系统账号不得挂部门，否则会被算进部门人数统计");
        assertDoesNotThrow(this::verifyMigration);
    }

    @Test
    @DisplayName("软删残留的 admin 行被复活并归一，不因 username 唯一键插入失败")
    void revivesSoftDeletedAdminRow() {
        setUpSchema();
        jdbc.execute("INSERT INTO sys_user (username, password, name, emp_id, role, status, deleted) VALUES "
                + "('admin', '" + VALID_HASH + "', '舊管理員', 'MF00009', 'guest', 0, 1), "
                + "('MF00001', '" + VALID_HASH + "', 'Bee', 'MF00001', 'admin', 1, 0)");

        migrate();

        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE username = 'admin'", Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "SELECT deleted FROM sys_user WHERE username = 'admin'", Integer.class));
        assertEquals(1, jdbc.queryForObject(
                "SELECT status FROM sys_user WHERE username = 'admin'", Integer.class));
        assertEquals("admin", jdbc.queryForObject(
                "SELECT role FROM sys_user WHERE username = 'admin'", String.class));
        assertEquals(VALID_HASH, jdbc.queryForObject(
                "SELECT password FROM sys_user WHERE username = 'admin'", String.class),
                "已是合法 BCrypt 时保留原密码，不打强制改密标记");
        assertEquals(0, jdbc.queryForObject(
                "SELECT must_change_password FROM sys_user WHERE username = 'admin'", Integer.class));
        assertNull(jdbc.queryForObject("SELECT emp_id FROM sys_user WHERE username = 'admin'", String.class));
        assertEquals("guest", jdbc.queryForObject(
                "SELECT role FROM sys_user WHERE username = 'MF00001'", String.class));
        assertDoesNotThrow(this::verifyMigration);
    }

    @Test
    @DisplayName("后置校验：超管被停用 / 出现第二个超管 / 密码非法 一律失败，不记版本以便下次重试")
    void verifyFailsOnUnsafeStates() {
        setUpSchema();
        seedLegacyDb();
        migrate();
        assertDoesNotThrow(this::verifyMigration);

        // 超管被停用 → 无法登录接管
        jdbc.update("UPDATE sys_user SET status = 0 WHERE username = 'admin'");
        IllegalStateException disabled = assertThrows(IllegalStateException.class, this::verifyMigration);
        assertTrue(disabled.getMessage().contains("停用"), disabled.getMessage());
        jdbc.update("UPDATE sys_user SET status = 1 WHERE username = 'admin'");

        // 出现第二个超管（旁路复发）
        jdbc.update("UPDATE sys_user SET role = 'admin' WHERE username = 'MF00002'");
        IllegalStateException duplicated = assertThrows(IllegalStateException.class, this::verifyMigration);
        assertTrue(duplicated.getMessage().contains("应为 1 个"), duplicated.getMessage());
        jdbc.update("UPDATE sys_user SET role = 'guest' WHERE username = 'MF00002'");

        // 超管换成了别的账号（admin 被改名 / 未建起来）
        jdbc.update("UPDATE sys_user SET role = 'guest' WHERE username = 'admin'");
        jdbc.update("UPDATE sys_user SET role = 'admin' WHERE username = 'MF00001'");
        IllegalStateException wrong = assertThrows(IllegalStateException.class, this::verifyMigration);
        assertTrue(wrong.getMessage().contains("不是内置系统账号"), wrong.getMessage());
    }

    @Test
    @DisplayName("工号重编号迁移不得吞掉系统账号（历史事故：admin 就是这样变成 MF00001 的）")
    void empNoMigrationNeverRenamesBuiltinAdmin() {
        setUpSchema();
        seedLegacyDb();
        migrate();

        // migrateEmpIdToMF 每次启动执行，连续跑两次都必须保持 admin 不变
        ReflectionTestUtils.invokeMethod(initializer, "migrateEmpIdToMF");
        ReflectionTestUtils.invokeMethod(initializer, "migrateEmpIdToMF");

        assertNotNull(jdbc.queryForObject(
                "SELECT id FROM sys_user WHERE username = 'admin'", Long.class),
                "系统账号被改名成 MFxxxxx 意味着超管入口消失");
        assertEquals("admin", jdbc.queryForObject(
                "SELECT role FROM sys_user WHERE username = 'admin'", String.class));
        // 员工工号未被无谓重排
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE username = 'MF00001'", Integer.class));
    }

    @Test
    @DisplayName("迁移已登记进 catalog.json：DATA_MIGRATION 阶段且依赖超管收敛迁移")
    void migrationIsRegisteredInCatalog() throws Exception {
        MigrationEntry entry = MigrationCatalog.readAll().stream()
                .filter(e -> "core:builtin-admin-account-v1".equals(e.getVersionKey()))
                .findFirst().orElse(null);
        assertNotNull(entry, "core:builtin-admin-account-v1 未登记进 catalog.json，不会参与自动执行");
        assertEquals(SchemaPhase.DATA_MIGRATION, entry.getPhase());
        assertEquals(MigrationEntry.ExecutionType.JAVA, entry.getExecutionType());
        assertEquals("dataInitializer", entry.getExecutor());
        assertTrue(entry.getDependencies().contains("core:super-admin-dedup-v1"),
                "必须晚于超管收敛迁移：本迁移复用其剥离 admin 角色绑定的逻辑");
        List<String> problems = MigrationCatalog.validate(MigrationCatalog.readAll());
        assertTrue(problems.isEmpty(), "迁移登记表存在不一致: " + problems);
    }
}

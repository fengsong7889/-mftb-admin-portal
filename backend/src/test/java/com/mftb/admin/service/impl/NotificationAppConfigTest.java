package com.mftb.admin.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.NotificationAppDTO.Save;
import com.mftb.admin.dto.NotificationAppDTO.ScenarioSave;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.util.SignTokenUtil;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import com.mftb.admin.util.OperatorResolver;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static com.mftb.admin.service.DingTalkAppService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 仅使用内存数据库：验证配置持久化、事务、并发与密钥保护，不修改业务库。 */
class NotificationAppConfigTest {
    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private Long appId;
    private NotificationAppService service;
    private ValidatorFactory validatorFactory;

    @BeforeEach
    void setUp() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:app_" + UUID.randomUUID()
                + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE sys_config (config_key VARCHAR(100) PRIMARY KEY, config_value VARCHAR(1000), updated_at TIMESTAMP)");
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        migrate();
        var operator = mock(OperatorResolver.class);
        when(operator.currentOperatorName()).thenReturn("测试操作人");
        validatorFactory = Validation.buildDefaultValidatorFactory();
        service = new NotificationAppService(jdbc, operator, validatorFactory.getValidator());
    }

    @AfterEach
    void tearDown() {
        validatorFactory.close();
        jdbc.execute("SHUTDOWN");
    }

    private Save request(String key, String secret) {
        var dto = new Save();
        dto.setName("企业通知应用");
        dto.setAppKey(key);
        dto.setAppSecret(secret);
        dto.setAgentId("4988071335");
        dto.setBaseUrl("https://admin.example.com/portal/");
        return dto;
    }

    private void migrate() {
        var script = new ResourceDatabasePopulator(new ClassPathResource("db/migrations/165_notification_apps_and_scenarios.sql"));
        script.setSqlScriptEncoding("UTF-8");
        script.execute(jdbc.getDataSource());
    }

    private void save(Save request) {
        appId = tx.execute(status -> service.save(appId, request));
    }

    private String value(String key) {
        if (APP_KEY.equals(key)) return service.credentials(appId, false).getAppKey();
        if (APP_SECRET.equals(key)) return service.credentials(appId, false).getAppSecret();
        return jdbc.queryForObject("SELECT config_value FROM sys_config WHERE config_key = ?", String.class, key);
    }

    @Test
    void firstSaveCreatesKeysAndNeverSerializesSecrets() throws Exception {
        assertTrue(service.list(null, null).isEmpty());
        var dto = request("ding_test", "test-secret");
        save(dto);
        var view = service.detail(appId);
        assertTrue(view.appSecretConfigured());
        assertTrue(view.tokenSecretConfigured());
        assertEquals("https://admin.example.com/portal", view.baseUrl());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_config", Integer.class));
        String json = new ObjectMapper().writeValueAsString(view);
        assertFalse(json.contains("test-secret"));
        assertFalse(json.contains(value(SIGN_SECRET)));
        assertFalse(new ObjectMapper().writeValueAsString(dto).contains("test-secret"));
        assertFalse(new ObjectMapper().writeValueAsString(service.credentials(appId, false)).contains("test-secret"));
    }

    @Test
    void blankSecretKeepsOriginalAndSigningKeyIsStable() {
        save(request("ding_test", "test-secret"));
        String signingKey = value(SIGN_SECRET);
        save(request("ding_test", ""));
        save(request("ding_test", null));
        assertEquals("test-secret", value(APP_SECRET));
        assertEquals(signingKey, value(SIGN_SECRET));
        assertEquals(1, service.list(null, null).size());
    }

    @Test
    void missingSecretOnFirstSaveOrAppSwitchRollsBack() {
        assertThrows(BusinessException.class, () -> save(request("ding_test", null)));
        assertTrue(service.list(null, null).isEmpty());
        save(request("ding_test", "test-secret"));
        assertThrows(BusinessException.class, () -> save(request("ding_other", "")));
        assertEquals("ding_test", value(APP_KEY));
        assertEquals(1, service.list(null, null).size());
    }

    @ParameterizedTest
    @ValueSource(strings = {"javascript:alert(1)", "ftp://example.com", "//example.com", "https://user:pass@example.com",
            "https://example.com/#/sign", "https://example.com?token=x", "https://example.com:99999", "https://example.com:0"})
    void rejectsUnsafeSiteUrls(String url) {
        var dto = request("ding_test", "test-secret");
        dto.setBaseUrl(url);
        assertThrows(BusinessException.class, () -> save(dto));

    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "0", "1.5", "abc", "9223372036854775808"})
    void rejectsInvalidAgentIds(String id) {
        var dto = request("ding_test", "test-secret");
        dto.setAgentId(id);
        assertThrows(BusinessException.class, () -> save(dto));
    }

    @Test
    void rollbackDoesNotInvalidateCacheOrLeavePartialChanges() {
        save(request("ding_test", "test-secret"));
        tx.executeWithoutResult(status -> {
            service.save(appId, request("ding_next", "next-secret"));
            status.setRollbackOnly();
        });
        assertEquals("ding_test", value(APP_KEY));
        assertEquals("test-secret", value(APP_SECRET));

    }

    @Test
    void independentApplicationsRejectDuplicatesAndShareStableSigningKey() {
        save(request("ding_one", "secret-one"));
        long first = appId;
        String signingKey = value(SIGN_SECRET);
        long second = tx.execute(status -> service.save(null, request("ding_two", "secret-two")));
        assertEquals(2, service.list(null, null).size());
        assertEquals("secret-one", service.credentials(first, false).getAppSecret());
        assertEquals("secret-two", service.credentials(second, false).getAppSecret());
        assertThrows(BusinessException.class, () -> tx.execute(status -> service.save(null, request("ding_one", "other"))));
        assertEquals(signingKey, value(SIGN_SECRET));
    }

    @Test
    void scenariosRespectBindingAndBothSwitchesAndPreventDeletion() {
        save(request("ding_one", "secret-one"));
        assertNull(service.resolve(NotificationAppService.CLAIM_SIGN));
        tx.executeWithoutResult(status -> service.saveScenario(NotificationAppService.CLAIM_SIGN, new ScenarioSave(appId, true)));
        assertEquals(appId.longValue(), service.resolve(NotificationAppService.CLAIM_SIGN).getId());
        assertThrows(BusinessException.class, () -> tx.executeWithoutResult(status -> service.delete(appId)));
        tx.executeWithoutResult(status -> service.toggle(appId, false));
        assertNull(service.resolve(NotificationAppService.CLAIM_SIGN));
        tx.executeWithoutResult(status -> service.saveScenario(NotificationAppService.CLAIM_SIGN, new ScenarioSave(appId, false)));
        assertThrows(BusinessException.class, () -> tx.executeWithoutResult(status -> service.saveScenario(NotificationAppService.CLAIM_SIGN, new ScenarioSave(appId, true))));
        assertThrows(BusinessException.class, () -> tx.executeWithoutResult(status -> service.saveScenario("not_integrated", new ScenarioSave(appId, true))));
        tx.executeWithoutResult(status -> service.toggle(appId, true));
        assertNull(service.resolve(NotificationAppService.CLAIM_SIGN));
        tx.executeWithoutResult(status -> service.saveScenario(NotificationAppService.CLAIM_SIGN, new ScenarioSave(null, false)));
        tx.executeWithoutResult(status -> service.delete(appId));
        assertTrue(service.list(null, null).isEmpty());
    }

    @Test
    void migrationPreservesCredentialsRoutesAndAlreadyIssuedSigningLinks() {
        // 模拟升级前数据库；全部写入仅限当前 H2 测试库。
        jdbc.update("DELETE FROM sys_config WHERE config_key='notification_apps_migrated'");
        jdbc.update("DELETE FROM sys_notification_scenario");
        for (String[] row : new String[][]{{APP_KEY, "ding_old"}, {APP_SECRET, "old-secret"}, {AGENT_ID, "123"},
                {BASE_URL, "https://old.example.com"}, {SIGN_SECRET, "old-signing-secret"}}) {
            jdbc.update("INSERT INTO sys_config (config_key, config_value) VALUES (?, ?)", row[0], row[1]);
        }
        String token = SignTokenUtil.generate(10, 20, value(SIGN_SECRET));
        migrate();
        appId = service.list(null, null).get(0).id();
        assertEquals("ding_old", value(APP_KEY));
        assertEquals("old-secret", value(APP_SECRET));
        assertEquals(appId.longValue(), service.resolve(NotificationAppService.CLAIM_SIGN).getId());
        tx.executeWithoutResult(status -> service.saveScenario(NotificationAppService.CLAIM_SIGN, new ScenarioSave(null, false)));
        save(request("ding_new", "new-secret"));
        migrate();
        assertEquals("ding_new", value(APP_KEY));
        assertNull(service.resolve(NotificationAppService.CLAIM_SIGN));
        assertEquals(1, service.list(null, null).size());
        tx.executeWithoutResult(status -> service.delete(appId));
        migrate();
        assertTrue(service.list(null, null).isEmpty());
        assertTrue(SignTokenUtil.validate(token, 10, 20, value(SIGN_SECRET)));
    }

    @Test
    void concurrentSavesNeverMixCredentialsOrRotateSigningKey() throws Exception {
        save(request("ding_test", "test-secret"));
        String signingKey = value(SIGN_SECRET);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> save(request("ding_one", "secret-one")));
            var second = pool.submit(() -> save(request("ding_two", "secret-two")));
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
            assertEquals(value(APP_KEY).equals("ding_one") ? "secret-one" : "secret-two", value(APP_SECRET));
            assertEquals(signingKey, value(SIGN_SECRET));
        } finally {
            pool.shutdownNow();
        }
    }
}

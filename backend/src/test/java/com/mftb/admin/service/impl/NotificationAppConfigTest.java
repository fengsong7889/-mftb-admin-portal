package com.mftb.admin.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DingTalkAppConfigRequest;
import com.mftb.admin.service.DingTalkAppService;
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
    private DingTalkAppService app;
    private NotificationChannelServiceImpl service;
    private ValidatorFactory validatorFactory;

    @BeforeEach
    void setUp() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:app_" + UUID.randomUUID()
                + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE sys_config (config_key VARCHAR(100) PRIMARY KEY, config_value VARCHAR(1000), updated_at TIMESTAMP)");
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        app = mock(DingTalkAppService.class);
        var operator = mock(OperatorResolver.class);
        when(operator.currentOperatorName()).thenReturn("测试操作人");
        validatorFactory = Validation.buildDefaultValidatorFactory();
        service = new NotificationChannelServiceImpl(null, operator, null, jdbc, app, validatorFactory.getValidator());
    }

    @AfterEach
    void tearDown() {
        validatorFactory.close();
        jdbc.execute("SHUTDOWN");
    }

    private DingTalkAppConfigRequest request(String key, String secret) {
        var dto = new DingTalkAppConfigRequest();
        dto.setAppKey(key);
        dto.setAppSecret(secret);
        dto.setAgentId("4988071335");
        dto.setBaseUrl("https://admin.example.com/portal/");
        return dto;
    }

    private void save(DingTalkAppConfigRequest request) {
        tx.executeWithoutResult(status -> service.saveAppConfig(request));
    }

    private String value(String key) {
        return jdbc.queryForObject("SELECT config_value FROM sys_config WHERE config_key = ?", String.class, key);
    }

    @Test
    void firstSaveCreatesKeysAndNeverSerializesSecrets() throws Exception {
        assertFalse(service.getAppConfig().appSecretConfigured());
        var dto = request("ding_test", "test-secret");
        save(dto);
        var view = service.getAppConfig();
        assertTrue(view.appSecretConfigured());
        assertTrue(view.tokenSecretConfigured());
        assertEquals("https://admin.example.com/portal", view.baseUrl());
        assertEquals(5, jdbc.queryForObject("SELECT COUNT(*) FROM sys_config", Integer.class));
        String json = new ObjectMapper().writeValueAsString(view);
        assertFalse(json.contains("test-secret"));
        assertFalse(json.contains(value(SIGN_SECRET)));
        assertFalse(new ObjectMapper().writeValueAsString(dto).contains("test-secret"));
        verify(app).invalidateAccessToken();
    }

    @Test
    void blankSecretKeepsOriginalAndSigningKeyIsStable() {
        save(request("ding_test", "test-secret"));
        String signingKey = value(SIGN_SECRET);
        save(request("ding_test", ""));
        save(request("ding_test", null));
        assertEquals("test-secret", value(APP_SECRET));
        assertEquals(signingKey, value(SIGN_SECRET));
        verify(app, times(3)).invalidateAccessToken();
    }

    @Test
    void missingSecretOnFirstSaveOrAppSwitchRollsBack() {
        assertThrows(BusinessException.class, () -> save(request("ding_test", null)));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_config", Integer.class));
        save(request("ding_test", "test-secret"));
        assertThrows(BusinessException.class, () -> save(request("ding_other", "")));
        assertEquals("ding_test", value(APP_KEY));
        verify(app, times(1)).invalidateAccessToken();
    }

    @ParameterizedTest
    @ValueSource(strings = {"javascript:alert(1)", "ftp://example.com", "//example.com", "https://user:pass@example.com",
            "https://example.com/#/sign", "https://example.com?token=x", "https://example.com:99999", "https://example.com:0"})
    void rejectsUnsafeSiteUrls(String url) {
        var dto = request("ding_test", "test-secret");
        dto.setBaseUrl(url);
        assertThrows(BusinessException.class, () -> save(dto));
        verifyNoInteractions(app);
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
        clearInvocations(app);
        tx.executeWithoutResult(status -> {
            service.saveAppConfig(request("ding_next", "next-secret"));
            verifyNoInteractions(app);
            status.setRollbackOnly();
        });
        assertEquals("ding_test", value(APP_KEY));
        assertEquals("test-secret", value(APP_SECRET));
        verifyNoInteractions(app);
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

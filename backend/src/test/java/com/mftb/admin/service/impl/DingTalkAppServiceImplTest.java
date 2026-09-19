package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.service.NotificationAppService.Credentials;
import com.mftb.admin.service.DingTalkAppService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.scheduling.annotation.AsyncAnnotationBeanPostProcessor;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.List;
import java.util.Map;

import static com.mftb.admin.service.NotificationAppService.CLAIM_SIGN;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 对钉钉网络请求使用 mock，不发送真实通知。 */
class DingTalkAppServiceImplTest {
    private RestTemplate http;
    private DingTalkAppServiceImpl service;
    private NotificationAppService apps;
    private Credentials app;

    @BeforeEach
    void setUp() {
        apps = mock(NotificationAppService.class);
        app = new Credentials(1, "ding_test", "fake-secret", "123456", "https://example.com", true);
        when(apps.credentials(1, false)).thenReturn(app);
        when(apps.resolve(CLAIM_SIGN)).thenReturn(app);
        http = mock(RestTemplate.class);
        service = new DingTalkAppServiceImpl(apps, http);
    }

    private void allowToken() {
        when(http.getForObject(any(URI.class), eq(Map.class)))
                .thenReturn(Map.of("errcode", 0, "access_token", "fake-token", "expires_in", 7200));
    }

    @Test
    void testsAlwaysCheckRemoteCredentialsAndNeverSendMessages() {
        allowToken();
        service.testConnection(1);
        service.testConnection(1);
        verify(http, times(2)).getForObject(any(URI.class), eq(Map.class));
        verify(http, never()).postForObject(anyString(), any(), eq(Map.class));
    }

    @Test
    void connectionErrorsAreSanitizedAndMissingTokensAreRejected() {
        when(http.getForObject(any(URI.class), eq(Map.class)))
                .thenReturn(Map.of("errcode", 40096, "errmsg", "fake-secret"));
        var error = assertThrows(BusinessException.class, () -> service.testConnection(1));
        assertTrue(error.getMessage().contains("40096"));
        assertFalse(error.getMessage().contains("fake-secret"));
        when(http.getForObject(any(URI.class), eq(Map.class)))
                .thenThrow(new ResourceAccessException("https://example.com?appsecret=fake-secret"));
        assertFalse(assertThrows(BusinessException.class, () -> service.testConnection(1)).getMessage().contains("fake-secret"));
        when(http.getForObject(any(URI.class), eq(Map.class))).thenReturn(Map.of("errcode", 0));
        assertThrows(BusinessException.class, () -> service.testConnection(1));
    }

    @Test
    void invalidationAndCredentialChangesRefreshCachedToken() {
        allowToken();
        when(http.postForObject(anyString(), any(), eq(Map.class))).thenReturn(Map.of("errcode", 0));
        assertTrue(service.sendWorkNotification(CLAIM_SIGN, 1, List.of("test-user"), "测试", "测试").join());
        assertTrue(service.sendWorkNotification(CLAIM_SIGN, 1, List.of("test-user"), "测试", "测试").join());
        verify(http, times(1)).getForObject(any(URI.class), eq(Map.class));
        when(apps.resolve(CLAIM_SIGN)).thenReturn(new Credentials(1, "ding_test", "new-secret", "123456", "https://example.com", true));
        service.sendWorkNotification(CLAIM_SIGN, 1, List.of("test-user"), "测试", "测试").join();
        verify(http, times(2)).getForObject(any(URI.class), eq(Map.class));
        when(apps.resolve(CLAIM_SIGN)).thenReturn(new Credentials(2, "ding_second", "second-secret", "999", "https://example.com", true));
        service.sendWorkNotification(CLAIM_SIGN, 2, List.of("test-user"), "测试", "测试").join();
        verify(http, times(3)).getForObject(any(URI.class), eq(Map.class));
    }

    @Test
    void disabledOrReboundScenarioDoesNotSendThroughOldApplication() {
        when(apps.resolve(CLAIM_SIGN)).thenReturn(null);
        assertFalse(service.sendWorkNotification(CLAIM_SIGN, 1, List.of("test-user"), "测试", "测试").join());
        when(apps.resolve(CLAIM_SIGN)).thenReturn(new Credentials(2, "other", "other-secret", "999", "https://example.com", true));
        assertFalse(service.sendWorkNotification(CLAIM_SIGN, 1, List.of("test-user"), "测试", "测试").join());
        verifyNoInteractions(http);
    }

    @Test
    void asyncProxyAcceptsTheReturnType() {
        var processor = new AsyncAnnotationBeanPostProcessor();
        processor.setExecutor(new SyncTaskExecutor());
        var proxy = (DingTalkAppService) processor.postProcessAfterInitialization(service, "dingTalkAppService");
        assertFalse(proxy.sendWorkNotification(CLAIM_SIGN, 1, List.of(), "测试", "测试").join());
    }
}

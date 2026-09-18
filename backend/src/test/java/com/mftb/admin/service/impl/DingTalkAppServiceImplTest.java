package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysConfig;
import com.mftb.admin.mapper.SysConfigMapper;
import com.mftb.admin.service.DingTalkAppService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.scheduling.annotation.AsyncAnnotationBeanPostProcessor;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.mftb.admin.service.DingTalkAppService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 对钉钉网络请求使用 mock，不发送真实通知。 */
class DingTalkAppServiceImplTest {
    private RestTemplate http;
    private DingTalkAppServiceImpl service;
    private Map<String, String> config;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysConfig.class);
        config = new HashMap<>(Map.of(APP_KEY, "ding_test", APP_SECRET, "fake-secret", AGENT_ID, "123456"));
        var mapper = mock(SysConfigMapper.class);
        when(mapper.selectOne(any())).thenAnswer(invocation -> {
            AbstractWrapper<?, ?, ?> wrapper = invocation.getArgument(0);
            wrapper.getSqlSegment();
            String key = (String) wrapper.getParamNameValuePairs().values().iterator().next();
            if (!config.containsKey(key)) return null;
            var entity = new SysConfig();
            entity.setConfigValue(config.get(key));
            return entity;
        });
        http = mock(RestTemplate.class);
        service = new DingTalkAppServiceImpl(mapper, http);
    }

    private void allowToken() {
        when(http.getForObject(any(URI.class), eq(Map.class)))
                .thenReturn(Map.of("errcode", 0, "access_token", "fake-token", "expires_in", 7200));
    }

    @Test
    void testsAlwaysCheckRemoteCredentialsAndNeverSendMessages() {
        allowToken();
        service.testConnection();
        service.testConnection();
        verify(http, times(2)).getForObject(any(URI.class), eq(Map.class));
        verify(http, never()).postForObject(anyString(), any(), eq(Map.class));
    }

    @Test
    void connectionErrorsAreSanitizedAndMissingTokensAreRejected() {
        when(http.getForObject(any(URI.class), eq(Map.class)))
                .thenReturn(Map.of("errcode", 40096, "errmsg", "fake-secret"));
        var error = assertThrows(BusinessException.class, service::testConnection);
        assertTrue(error.getMessage().contains("40096"));
        assertFalse(error.getMessage().contains("fake-secret"));
        when(http.getForObject(any(URI.class), eq(Map.class)))
                .thenThrow(new ResourceAccessException("https://example.com?appsecret=fake-secret"));
        assertFalse(assertThrows(BusinessException.class, service::testConnection).getMessage().contains("fake-secret"));
        when(http.getForObject(any(URI.class), eq(Map.class))).thenReturn(Map.of("errcode", 0));
        assertThrows(BusinessException.class, service::testConnection);
    }

    @Test
    void invalidationAndCredentialChangesRefreshCachedToken() {
        allowToken();
        when(http.postForObject(anyString(), any(), eq(Map.class))).thenReturn(Map.of("errcode", 0));
        assertTrue(service.sendWorkNotification(List.of("test-user"), "测试", "测试").join());
        assertTrue(service.sendWorkNotification(List.of("test-user"), "测试", "测试").join());
        verify(http, times(1)).getForObject(any(URI.class), eq(Map.class));
        service.invalidateAccessToken();
        service.sendWorkNotification(List.of("test-user"), "测试", "测试").join();
        config.put(APP_SECRET, "new-secret");
        service.sendWorkNotification(List.of("test-user"), "测试", "测试").join();
        verify(http, times(3)).getForObject(any(URI.class), eq(Map.class));
    }

    @Test
    void asyncProxyAcceptsTheReturnType() {
        var processor = new AsyncAnnotationBeanPostProcessor();
        processor.setExecutor(new SyncTaskExecutor());
        var proxy = (DingTalkAppService) processor.postProcessAfterInitialization(service, "dingTalkAppService");
        assertFalse(proxy.sendWorkNotification(List.of(), "测试", "测试").join());
    }
}

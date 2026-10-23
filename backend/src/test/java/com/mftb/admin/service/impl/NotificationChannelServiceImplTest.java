package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.SysNotificationChannelSaveDTO;
import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.mapper.SysNotificationChannelMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 通知渠道保存与测试的安全口径测试。
 *
 * <p>这组用例钉住三件真实踩过的事：
 * <ol>
 *   <li><b>浏览器自动填充的登录凭据不是配置</b>：Webhook 被填成工号、加签密钥被填成登录密码时，
 *       后端必须拒绝写库，否则线上测试只会得到一句看不出原因的「签名不匹配」；</li>
 *   <li><b>「留空表示不修改」必须是真的</b>：编辑时改个备注就把已保存的加签密钥清空，
 *       会让群通知静默失效，且页面上看不出任何异常；</li>
 *   <li><b>加签密钥属凭据</b>：详情接口与失败提示都不得回传明文或前后缀，异常文本里的
 *       完整 webhook（含 access_token 与 sign）同样不得外泄。</li>
 * </ol>
 */
class NotificationChannelServiceImplTest {

    private static final String HOOK = "https://oapi.dingtalk.com/robot/send?access_token=TOKEN";
    private static final String SECRET = "SEC0123456789abcdef";

    private SysNotificationChannelMapper mapper;
    private OperatorResolver operatorResolver;
    private RestTemplate restTemplate;
    private NotificationChannelServiceImpl service;

    @BeforeEach
    void setUp() {
        mapper = mock(SysNotificationChannelMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        restTemplate = mock(RestTemplate.class);
        service = new NotificationChannelServiceImpl(mapper, operatorResolver, restTemplate);
        when(operatorResolver.currentOperatorName()).thenReturn("測試員");
    }

    private static SysNotificationChannelSaveDTO dto(String webhook, String secret) {
        SysNotificationChannelSaveDTO dto = new SysNotificationChannelSaveDTO();
        dto.setName("項目匯報");
        dto.setChannel("dingtalk");
        dto.setWebhookUrl(webhook);
        dto.setSecret(secret);
        dto.setEnabled(1);
        dto.setIsDefault(0);
        dto.setAtMobiles("");
        dto.setScenarios("rdm");
        dto.setRemark("");
        return dto;
    }

    private static SysNotificationChannel existing() {
        SysNotificationChannel row = new SysNotificationChannel();
        row.setId(7L);
        row.setName("項目匯報");
        row.setChannel("dingtalk");
        row.setWebhookUrl(HOOK);
        row.setSecret(SECRET);
        row.setEnabled(1);
        row.setIsDefault(0);
        row.setAtMobiles("");
        row.setScenarios("rdm");
        row.setRemark("");
        return row;
    }

    @Test
    @DisplayName("新增: Webhook 被填成工号时拒绝写库")
    void rejectsNonUrlWebhookOnCreate() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create(dto("MF00002", SECRET)));

        assertTrue(ex.getMessage().contains("http"));
        verify(mapper, never()).insert(any(SysNotificationChannel.class));
    }

    @Test
    @DisplayName("新增: 钉钉 Webhook 缺 access_token 时拒绝")
    void rejectsDingtalkWebhookWithoutToken() {
        assertThrows(BusinessException.class,
                () -> service.create(dto("https://oapi.dingtalk.com/robot/send", SECRET)));
        verify(mapper, never()).insert(any(SysNotificationChannel.class));
    }

    @Test
    @DisplayName("新增: 加签密钥被填成登录密码时拒绝")
    void rejectsLoginPasswordAsSecret() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create(dto(HOOK, "Feng@9510")));

        assertTrue(ex.getMessage().contains("SEC"));
        verify(mapper, never()).insert(any(SysNotificationChannel.class));
    }

    @Test
    @DisplayName("编辑: Webhook 留空保留原值")
    void keepsWebhookWhenBlankOnUpdate() {
        SysNotificationChannel row = existing();
        when(mapper.selectById(7L)).thenReturn(row);

        service.update(7L, dto("", null));

        assertEquals(HOOK, row.getWebhookUrl());
    }

    @Test
    @DisplayName("编辑: 密钥缺省(null)保留原值, 改备注不会清空密钥")
    void keepsSecretWhenMissingOnUpdate() {
        SysNotificationChannel row = existing();
        when(mapper.selectById(7L)).thenReturn(row);

        service.update(7L, dto("", null));

        assertEquals(SECRET, row.getSecret());
    }

    @Test
    @DisplayName("编辑: 密钥显式传空串才清空(改用关键词模式)")
    void clearsSecretWhenExplicitlyEmpty() {
        SysNotificationChannel row = existing();
        when(mapper.selectById(7L)).thenReturn(row);

        service.update(7L, dto("", ""));

        assertEquals("", row.getSecret());
    }

    @Test
    @DisplayName("详情: 密钥只回配置标识, 不泄露任何前缀")
    void detailHidesSecret() {
        when(mapper.selectById(7L)).thenReturn(existing());

        Map<String, Object> detail = service.getDetail(7L);

        assertEquals("********", detail.get("secret"));
        assertEquals(Boolean.TRUE, detail.get("secretConfigured"));
        assertFalse(String.valueOf(detail.get("secret")).contains("SEC012"));
    }

    @Test
    @DisplayName("测试发送: 历史脏密钥先本地拦截, 零外调")
    void sendTestRejectsDirtySecretWithoutCall() {
        SysNotificationChannel row = existing();
        row.setSecret("Feng@9510");
        when(mapper.selectById(7L)).thenReturn(row);

        String result = service.sendTest(7L);

        assertTrue(result.contains("SEC"));
        verify(restTemplate, never()).postForObject(anyString(), any(), eq(Map.class));
    }

    @Test
    @DisplayName("测试发送: 签名不匹配时给出可操作提示, 不回传钉钉长文案")
    void sendTestMapsSignMismatch() {
        when(mapper.selectById(7L)).thenReturn(existing());
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("errcode", 310000,
                        "errmsg", "错误描述:机器人发送签名不匹配;解决方案:请确认签名和生成签名的时间戳必须都放在调用的网址中"));

        String result = service.sendTest(7L);

        assertTrue(result.contains("加簽密鑰不正確"));
        assertFalse(result.contains("解决方案"));
    }

    @Test
    @DisplayName("测试发送: 网络异常只回异常类型, 不回传含 access_token 的 URL")
    void sendTestHidesWebhookOnTransportError() {
        when(mapper.selectById(7L)).thenReturn(existing());
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenThrow(new ResourceAccessException(
                        "I/O error on POST request for \"" + HOOK + "&timestamp=1&sign=x\""));

        String result = service.sendTest(7L);

        assertFalse(result.contains("access_token"));
        assertFalse(result.contains("sign="));
    }
}

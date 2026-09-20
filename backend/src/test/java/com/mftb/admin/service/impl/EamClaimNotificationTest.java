package com.mftb.admin.service.impl;

import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.entity.SysConfig;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysConfigMapper;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.service.NotificationAppService.Credentials;
import com.mftb.admin.util.SignTokenUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static com.mftb.admin.service.NotificationAppService.CLAIM_SIGN;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 领用触发点与新的场景路由联动；不连接数据库、不发真实通知。 */
@ExtendWith(MockitoExtension.class)
class EamClaimNotificationTest {
    @Mock NotificationAppService notificationAppService;
    @Mock DingTalkAppService dingTalkAppService;
    @Mock SysConfigMapper sysConfigMapper;
    @InjectMocks EamClaimServiceImpl service;

    @Test
    void claimUsesBoundApplicationSiteAndKeepsOriginalSigningSecret() {
        when(notificationAppService.resolve(CLAIM_SIGN)).thenReturn(
                new Credentials(7, "ding_app", "test-secret", "123", "https://new.example.com/portal", true));
        var config = new SysConfig();
        config.setConfigValue("existing-signing-secret");
        when(sysConfigMapper.selectOne(any())).thenReturn(config);
        var claim = new EamClaim();
        claim.setId(10L);
        claim.setEmployeeId(20L);
        claim.setAssetId(30L);
        var employee = new SysUser();
        employee.setDingtalkUserId("employee-in-dingtalk");
        ReflectionTestUtils.invokeMethod(service, "doSendSignatureNotify", claim, employee, null);
        var content = ArgumentCaptor.forClass(String.class);
        verify(dingTalkAppService).sendWorkNotification(eq(CLAIM_SIGN), eq(7L), eq(List.of("employee-in-dingtalk")),
                eq("资产领用待签署"), content.capture());
        assertTrue(content.getValue().contains("https://new.example.com/portal/#/asset-claim-sign?token="));
        String token = content.getValue().split("token=")[1].split("[)\\s]")[0];
        assertTrue(SignTokenUtil.validate(token, 10, 20, "existing-signing-secret"));
    }

    @Test
    void disabledScenarioDoesNotReadLegacyConfigurationOrSend() {
        when(notificationAppService.resolve(CLAIM_SIGN)).thenReturn(null);
        ReflectionTestUtils.invokeMethod(service, "doSendSignatureNotify", new EamClaim(), new SysUser(), null);
        verifyNoInteractions(sysConfigMapper, dingTalkAppService);
    }
}

package com.mftb.admin.security;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.controller.NotificationChannelController;
import com.mftb.admin.controller.SysConfigController;
import com.mftb.admin.dto.NotificationAppDTO.View;
import com.mftb.admin.controller.NotificationAppController;
import com.mftb.admin.service.NotificationAppService;
import java.util.List;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.NotificationChannelService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 经过真实 JWT 过滤器和权限切面验证应用配置接口。 */
@WebMvcTest({NotificationAppController.class, NotificationChannelController.class, SysConfigController.class})
class NotificationAppPermissionTest extends SecurityTestBase {
    @MockBean private NotificationChannelService notificationChannelService;
    @MockBean private DingTalkAppService dingTalkAppService;
    @MockBean private NotificationAppService apps;
    private static final String PATH = "/api/notification-apps/1";
    private static final String VALID_BODY = """
            {"name":"通知应用","appKey":"ding_test","agentId":"123456","baseUrl":"https://example.com"}
            """;

    @Test
    void requiresAuthenticationAndMenuPermission() throws Exception {
        mockMvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        denyAllPermissions(guestUser);
        mockMvc.perform(authGet(PATH, guestUser)).andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(apps);
    }

    @Test
    void viewerSeesStatusButCannotSaveOrTest() throws Exception {
        grantPermission(viewerUser, "notification-config", "view");
        when(apps.detail(1)).thenReturn(new View(1, "通知应用", "dingtalk", "ding_test", "123456", "https://example.com",
                true, true, true, "", "", "", List.of()));
        mockMvc.perform(authGet(PATH, viewerUser))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.appSecretConfigured").value(true))
                .andExpect(jsonPath("$.data.appSecret").doesNotExist())
                .andExpect(jsonPath("$.data.tokenSecret").doesNotExist());
        mockMvc.perform(authPut(PATH, viewerUser).contentType(MediaType.APPLICATION_JSON).content(VALID_BODY))
                .andExpect(jsonPath("$.code").value(403));
        mockMvc.perform(authPost(PATH + "/test", viewerUser)).andExpect(jsonPath("$.code").value(403));
        mockMvc.perform(authPost("/api/notification-apps", viewerUser).contentType(MediaType.APPLICATION_JSON).content(VALID_BODY))
                .andExpect(jsonPath("$.code").value(403));
        mockMvc.perform(authDelete(PATH, viewerUser)).andExpect(jsonPath("$.code").value(403));
        mockMvc.perform(patch(PATH + "/toggle").header("Authorization", "Bearer " + tokenFor(viewerUser))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(jsonPath("$.code").value(403));
        mockMvc.perform(authPut("/api/notification-apps/scenarios/asset_claim_sign", viewerUser)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"appId\":1,\"enabled\":true}"))
                .andExpect(jsonPath("$.code").value(403));
        verify(apps, never()).save(any(), any());
        verifyNoInteractions(dingTalkAppService);
    }

    @Test
    void editorCanSaveAndFailuresAreNotReportedAsSuccess() throws Exception {
        grantPermission(guestUser, "notification-config", "edit");
        mockMvc.perform(authPut(PATH, guestUser).contentType(MediaType.APPLICATION_JSON).content(VALID_BODY))
                .andExpect(jsonPath("$.code").value(200));
        verify(apps).save(eq(1L), any());
        doThrow(new BusinessException(400, "釘釘連接失敗")).when(dingTalkAppService).testConnection(1);
        mockMvc.perform(authPost(PATH + "/test", guestUser))
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void malformedInputIsRejectedBeforePersistence() throws Exception {
        grantPermission(guestUser, "notification-config", "edit");
        mockMvc.perform(authPut(PATH, guestUser).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(jsonPath("$.code").value(400));
        verifyNoInteractions(apps);
    }

    @Test
    void retiredSingletonWritesCannotModifyMigratedCredentials() throws Exception {
        grantAllPermissions(adminUser);
        mockMvc.perform(authPut("/api/notification-channels/app-config", adminUser)
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_BODY))
                .andExpect(jsonPath("$.code").value(410));
        verifyNoInteractions(apps, notificationChannelService, dingTalkAppService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"dingtalk_app_key", "dingtalk_app_secret", "dingtalk_agent_id", "dingtalk_notify_base_url",
            "dingtalk_sign_token_secret", "DINGTALK_APP_SECRET", "díngtalk_app_secret"})
    void genericConfigEndpointCannotExposeOrOverwriteAppConfig(String key) throws Exception {
        grantAllPermissions(adminUser);
        mockMvc.perform(authGet("/api/sys-config/" + key, adminUser))
                .andExpect(jsonPath("$.code").value(403));
        mockMvc.perform(authPut("/api/sys-config/" + key, adminUser).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"replacement\"}"))
                .andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(sysConfigService);
    }
}

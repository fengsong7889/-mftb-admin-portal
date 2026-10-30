package com.mftb.admin.security;

import com.mftb.admin.controller.SysConfigController;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * 規則配置通用讀寫入口的「運行時只讀回退」權限測試。
 * <p>
 * 钉住的缺陷：自然流量參數頁用 {@code GET /api/sys-config/organic_traffic_show_dimension_weight}
 * 讀「維度權重與計算配置」開關，而該 key 歸屬平台系統的 {@code rule-algorithm} 菜單。
 * 只持有廣告系統算法庫（{@code promotion-algorithm}）的運營同學一律 403，前端只能保持默認「顯示」，
 * 表現為「管理員已在規則頁關閉、其他人照樣看得到」。
 * <p>
 * 期望：view 可由消費方菜單回退放行（讀得到才藏得掉）；edit 不放回退（改開關仍需規則維護權限），
 * 且完全無相關菜單的人仍然 403（回退不是把接口變公開）。
 */
@WebMvcTest(SysConfigController.class)
@DisplayName("SysConfig 規則讀寫: 算法配置開關的運行時只讀回退")
class SysConfigRuntimeReaderPermissionTest extends SecurityTestBase {

    /** 維度權重卡顯示開關（歸 rule-algorithm） */
    private static final String SHOW_WEIGHT_KEY = "organic_traffic_show_dimension_weight";
    /** 維度權重卡折疊態（同屬算法配置版塊，頁面渲染時一併讀） */
    private static final String COLLAPSED_KEY = "organic_traffic_weight_collapsed";
    /** 消費方菜單：廣告系統「算法庫」 */
    private static final String READER_MENU = "promotion-algorithm";
    /** 規則維護菜單：平台系統「算法配置規則」 */
    private static final String OWNER_MENU = "rule-algorithm";

    @Test
    @DisplayName("僅持算法庫菜單可讀顯示開關與折疊態, 但不能改")
    void algorithmLibraryUserCanReadButNotWrite() throws Exception {
        grantPermission(guestUser, READER_MENU, "view");
        when(sysConfigService.getConfigValue(SHOW_WEIGHT_KEY)).thenReturn("false");
        when(sysConfigService.getConfigValue(COLLAPSED_KEY)).thenReturn("true");

        mockMvc.perform(authGet("/api/sys-config/" + SHOW_WEIGHT_KEY, guestUser))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.value").value("false"));
        mockMvc.perform(authGet("/api/sys-config/" + COLLAPSED_KEY, guestUser))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.value").value("true"));
        // 批量讀取同樣走回退：規則頁之外的消費端會用批量接口
        when(sysConfigService.getConfigValues(anyCollection()))
                .thenReturn(Map.of(SHOW_WEIGHT_KEY, "false"));
        mockMvc.perform(authGet("/api/sys-config/batch?keys=" + SHOW_WEIGHT_KEY, guestUser))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data." + SHOW_WEIGHT_KEY).value("false"));

        // 只讀回退不适用于寫入：view 用戶改開關必須被拒
        mockMvc.perform(authPut("/api/sys-config/" + SHOW_WEIGHT_KEY, guestUser)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"true\"}"))
                .andExpect(jsonPath("$.code").value(403));
        verify(sysConfigService, never()).updateConfig(SHOW_WEIGHT_KEY, "true");
    }

    @Test
    @DisplayName("既無算法庫也無規則菜單時仍然 403(回退不等於公開)")
    void userWithoutEitherMenuStillDenied() throws Exception {
        denyAllPermissions(guestUser);
        mockMvc.perform(authGet("/api/sys-config/" + SHOW_WEIGHT_KEY, guestUser))
                .andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(sysConfigService);
    }

    @Test
    @DisplayName("持有規則維護菜單者照常可讀可寫")
    void ruleOwnerCanReadAndWrite() throws Exception {
        grantPermission(guestUser, OWNER_MENU, "view");
        grantPermission(guestUser, OWNER_MENU, "edit");
        when(sysConfigService.getConfigValue(SHOW_WEIGHT_KEY)).thenReturn("false");

        mockMvc.perform(authGet("/api/sys-config/" + SHOW_WEIGHT_KEY, guestUser))
                .andExpect(jsonPath("$.code").value(200));
        mockMvc.perform(authPut("/api/sys-config/" + SHOW_WEIGHT_KEY, guestUser)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"false\"}"))
                .andExpect(jsonPath("$.code").value(200));
        verify(sysConfigService).updateConfig(SHOW_WEIGHT_KEY, "false");
    }
}

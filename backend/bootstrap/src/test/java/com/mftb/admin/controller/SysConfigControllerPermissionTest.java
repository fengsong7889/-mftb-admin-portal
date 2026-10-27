package com.mftb.admin.controller;

import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SysConfigService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * SysConfigController 鉴权单元测试。
 * <p>
 * 覆盖规则菜单拆分后的两条语义：
 * <ul>
 *   <li>写（edit）永远只认 key 归属的規則維護菜單，運行時消費方回退不适用于写。</li>
 *   <li>读（view）在归属版块无权时，允许 {@code RuleConfigKeyRegistry} 登记的消費方菜單回退放行，
 *       使「廣告銷售-購買廣告」下單頁无需 rule-ad-sales 菜单即可读取 payment_mode_* 。</li>
 * </ul>
 */
@DisplayName("SysConfigController: 規則 key 动态鉴权与只读回退")
class SysConfigControllerPermissionTest {

    private SysConfigService sysConfigService;
    private PermissionService permissionService;
    private SysConfigController controller;

    @BeforeEach
    void setUp() {
        sysConfigService = mock(SysConfigService.class);
        permissionService = mock(PermissionService.class);
        controller = new SysConfigController(sysConfigService, permissionService);

        SysUser user = new SysUser();
        user.setId(10L);
        user.setUsername("MF00002");
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(user, null);
        authentication.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /** 让 hasPermission 只对指定菜单+动作返回 true */
    private void grant(String menuKey, String action) {
        when(permissionService.hasPermission(any(SysUser.class), eq(menuKey), eq(action))).thenReturn(true);
    }

    @Test
    @DisplayName("持有規則維護菜單：可讀 payment_mode_popular_merchant")
    void readAllowedForRuleOwnerMenu() {
        grant("rule-ad-sales", "view");
        when(sysConfigService.getConfigValue("payment_mode_popular_merchant")).thenReturn("mixed");

        assertDoesNotThrow(() -> controller.get("payment_mode_popular_merchant"));
    }

    @Test
    @DisplayName("仅持有廣告銷售菜單：可讀 payment_mode_*（运行时消费方回退）")
    void readAllowedForRuntimeReaderMenu() {
        grant("ad-sales", "view");

        assertDoesNotThrow(() -> controller.get("payment_mode_popular_merchant"));
    }

    @Test
    @DisplayName("两者皆无：读取被拒（默认拒绝）")
    void readDeniedWithoutAnyMenu() {
        assertThrows(PermissionDeniedException.class, () -> controller.get("payment_mode_popular_merchant"));
    }

    @Test
    @DisplayName("只读回退不适用于写：仅持廣告銷售不可改 payment_mode_*")
    void writeNotFallbackToReaderMenu() {
        grant("ad-sales", "edit");
        com.mftb.admin.dto.SysConfigUpdateDTO dto = new com.mftb.admin.dto.SysConfigUpdateDTO();
        dto.setValue("mixed");

        assertThrows(PermissionDeniedException.class,
                () -> controller.update("payment_mode_popular_merchant", dto));
    }

    @Test
    @DisplayName("非廣告銷售版块 key 不回退：gift 规则需 rule-gift 或 rule-config")
    void otherOwnerMenuHasNoReaderFallback() {
        grant("ad-sales", "view");

        assertThrows(PermissionDeniedException.class,
                () -> controller.get("gift_expire_remind_days"));
    }

    @Test
    @DisplayName("无法归类 key 回退旧 rule-config 菜单（保持拆分前行为）")
    void unknownKeyRequiresLegacyMenu() {
        grant("rule-config", "view");

        assertDoesNotThrow(() -> controller.get("organic_traffic_weight_collapsed"));
    }
}

package com.mftb.admin.constant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 規則配置 key → 版塊菜單歸屬登記表單測。
 * <p>
 * 與前端 {@code src/constants/ruleConfig.tsx} 的持久化 key 對齊, 防止拆分後歸屬漂移導致越權或寫入被拒。
 */
@DisplayName("RuleConfigKeyRegistry: 規則版塊歸屬")
class RuleConfigKeyRegistryTest {

    @Test
    @DisplayName("廣告銷售規則 key 歸屬 rule-ad-sales")
    void adSalesKeys() {
        assertEquals(RuleConfigKeyRegistry.MENU_AD_SALES, RuleConfigKeyRegistry.resolveOwnerMenu("ad_click_cart_lock_seconds"));
        assertEquals(RuleConfigKeyRegistry.MENU_AD_SALES, RuleConfigKeyRegistry.resolveOwnerMenu("payment_traffic_gift_day_value"));
        assertEquals(RuleConfigKeyRegistry.MENU_AD_SALES, RuleConfigKeyRegistry.resolveOwnerMenu("payment_mode_revival"));
        assertEquals(RuleConfigKeyRegistry.MENU_AD_SALES, RuleConfigKeyRegistry.resolveOwnerMenu("payment_mode_traffic_ad"));
    }

    @Test
    @DisplayName("贈送管理規則 key 歸屬 rule-gift")
    void giftKeys() {
        assertEquals(RuleConfigKeyRegistry.MENU_GIFT, RuleConfigKeyRegistry.resolveOwnerMenu("gift_expire_remind_days"));
        assertEquals(RuleConfigKeyRegistry.MENU_GIFT, RuleConfigKeyRegistry.resolveOwnerMenu("gift_expire_remind_frequency"));
        assertEquals(RuleConfigKeyRegistry.MENU_GIFT, RuleConfigKeyRegistry.resolveOwnerMenu("gift_limit_new_store"));
        assertEquals(RuleConfigKeyRegistry.MENU_GIFT, RuleConfigKeyRegistry.resolveOwnerMenu("gift_approval_revival"));
    }

    @Test
    @DisplayName("系統安全 / 算法配置 key 各歸其位")
    void securityAndAlgorithm() {
        assertEquals(RuleConfigKeyRegistry.MENU_SECURITY, RuleConfigKeyRegistry.resolveOwnerMenu("session_idle_timeout_ms"));
        assertEquals(RuleConfigKeyRegistry.MENU_ALGORITHM, RuleConfigKeyRegistry.resolveOwnerMenu("organic_traffic_show_dimension_weight"));
        assertEquals(RuleConfigKeyRegistry.MENU_ALGORITHM, RuleConfigKeyRegistry.resolveOwnerMenu("ai_model_qw_accounts"));
        assertEquals(RuleConfigKeyRegistry.MENU_ALGORITHM, RuleConfigKeyRegistry.resolveOwnerMenu("ai_model_ds_accounts"));
    }

    @Test
    @DisplayName("未知 key 不歸屬任何版塊")
    void unknownKeys() {
        assertNull(RuleConfigKeyRegistry.resolveOwnerMenu("organic_traffic_weight_collapsed"));
        assertNull(RuleConfigKeyRegistry.resolveOwnerMenu("product_version"));
        assertNull(RuleConfigKeyRegistry.resolveOwnerMenu(null));
        assertNull(RuleConfigKeyRegistry.resolveOwnerMenu("  "));
    }

    @Test
    @DisplayName("支付方式編輯器 4 個互斥布爾 key 為本地专用, 不落庫")
    void localOnlyPaymentBooleans() {
        assertTrue(RuleConfigKeyRegistry.isLocalOnly("payment_revival_promo_only"));
        assertTrue(RuleConfigKeyRegistry.isLocalOnly("payment_traffic_ad_switchable"));
        assertTrue(RuleConfigKeyRegistry.isLocalOnly("payment_golden_signboard_mixed"));
        // 聚合 key 与其它持久化 key 不应被误判为本地专用
        assertFalse(RuleConfigKeyRegistry.isLocalOnly("payment_mode_revival"));
        assertFalse(RuleConfigKeyRegistry.isLocalOnly("payment_traffic_gift_day_value"));
    }
}

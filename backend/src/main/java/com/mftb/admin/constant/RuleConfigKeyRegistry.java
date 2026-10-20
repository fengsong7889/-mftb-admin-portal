package com.mftb.admin.constant;

import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 規則配置 config key → 所屬版塊菜單 登記表。
 * <p>
 * 規則菜单拆分后（規則中心 rule-center 下 5 個子菜單），{@code /api/sys-config} 通用讀寫入口
 * 不再以單一 {@code rule-config} 菜單鑒權，而是按 config key 解析其歸屬版塊菜單，
 * 再校驗當前員工對該版塊菜單的 view/edit 權限，避免「持有任一版塊即可改全部規則」的越權。
 * <p>
 * 歸屬規則需與前端 {@code src/constants/ruleConfig.tsx} 的 key 清單保持一致，
 * 由後端單測 {@code RuleConfigKeyRegistryTest} 斷言。
 */
public final class RuleConfigKeyRegistry {

    private RuleConfigKeyRegistry() {
    }

    /** 廣告銷售規則 */
    public static final String MENU_AD_SALES = "rule-ad-sales";
    /** 贈送管理規則 */
    public static final String MENU_GIFT = "rule-gift";
    /** 系統安全規則 */
    public static final String MENU_SECURITY = "rule-security";
    /** 算法配置規則 */
    public static final String MENU_ALGORITHM = "rule-algorithm";
    /** 編號生成規則 */
    public static final String MENU_SEQ = "rule-seq";
    /** AI 治理（工具策略/緊急熔斷/通道賬號白名單同一域） */
    public static final String MENU_AI_GOVERNANCE = "ai-operation-auth";

    /** 精確 key → 歸屬菜單 */
    private static final Set<String> AD_SALES_KEYS = Set.of(
            "ad_click_cart_lock_seconds",
            "payment_traffic_gift_day_value"
    );

    private static final Set<String> GIFT_KEYS = Set.of(
            "gift_expire_remind_days",
            "gift_expire_remind_frequency"
    );

    private static final Set<String> SECURITY_KEYS = Set.of(
            "session_idle_timeout_ms"
    );

    private static final Set<String> ALGORITHM_KEYS = Set.of(
            "organic_traffic_show_dimension_weight"
    );

    /**
     * AI 通道账号白名单：归 AI 治理菜单 {@link #MENU_AI_GOVERNANCE}。
     * <p>以前挂在规则中心 rule-algorithm 下，但内置超管（工号账号）并无该菜单授权，
     * 结果：后端运行时按它做准入判定，管理端却读不到也写不了（GET/PUT 皆 403），
     * 规则页也没这两项。归到已经持有 view/edit 的「AI 操作授權」后，配置才真的可维护。
     */
    private static final Set<String> AI_GOVERNANCE_KEYS = Set.of(
            "ai_model_qw_accounts",
            "ai_model_ds_accounts"
    );

    /** 廣告銷售：各廣告類型支付方式聚合 key（payment_mode_{type}） */
    private static final Pattern AD_SALES_PREFIX = Pattern.compile("^payment_mode_.+$");
    /** 贈送管理：按廣告類型贈送上限/審批（gift_limit_{type} / gift_approval_{type}） */
    private static final Pattern GIFT_PREFIX = Pattern.compile("^(gift_limit_|gift_approval_).+$");

    /**
     * 編輯器本地布爾 key（不持久化到 sys_config）：
     * payment_{type}_{promo_only|gift_only|mixed|switchable} —— 後端以 payment_mode_{type} 單 key 為準。
     */
    private static final Pattern LOCAL_ONLY_PAYMENT_BOOL =
            Pattern.compile("^payment_(revival|popular_merchant|golden_signboard|traffic_ad)_(promo_only|gift_only|mixed|switchable)$");

    /**
     * 解析 config key 歸屬的規則版塊菜單。
     *
     * @return 歸屬菜單 menu_key；無法歸屬（未知/非規則類）返回 {@code null}
     */
    public static String resolveOwnerMenu(String configKey) {
        if (configKey == null || configKey.isBlank()) {
            return null;
        }
        String key = configKey.trim();
        if (AI_GOVERNANCE_KEYS.contains(key)) {
            return MENU_AI_GOVERNANCE;
        }
        if (SECURITY_KEYS.contains(key) || ALGORITHM_KEYS.contains(key)) {
            return SECURITY_KEYS.contains(key) ? MENU_SECURITY : MENU_ALGORITHM;
        }
        if (AD_SALES_KEYS.contains(key) || GIFT_KEYS.contains(key)) {
            return AD_SALES_KEYS.contains(key) ? MENU_AD_SALES : MENU_GIFT;
        }
        if (AD_SALES_PREFIX.matcher(key).matches()) {
            return MENU_AD_SALES;
        }
        if (GIFT_PREFIX.matcher(key).matches()) {
            return MENU_GIFT;
        }
        return null;
    }

    /**
     * 版塊菜單 → 運行時消費方菜單（僅 view 回退）。
     * <p>
     * 「廣告銷售-購買廣告」下單頁需讀取支付方式規則（{@code payment_mode_*}）決定現金/贈送抵扣呈現，
     * 但該 key 歸屬的 {@code rule-ad-sales} 是平台配置系統的規則維護菜單，不該成為下單的前置權限。
     * 故對這些版塊的只讀請求允許持消費方菜單（如 {@code ad-sales}）者讀取；寫入（edit）一律不走回退。
     */
    private static final Map<String, String> RUNTIME_READER_MENU = Map.of(
            MENU_AD_SALES, "ad-sales"
    );

    /**
     * 解析規則版塊的運行時只讀消費方菜單。
     *
     * @param ownerMenu {@link #resolveOwnerMenu(String)} 的結果
     * @return 可回退的消費方菜單 key；無登記返回 {@code null}
     */
    public static String resolveRuntimeReaderMenu(String ownerMenu) {
        return ownerMenu == null ? null : RUNTIME_READER_MENU.get(ownerMenu);
    }

    /**
     * 是否為前端編輯器专用的本地布爾 key（允許讀、寫入時跳過不落庫）。
     */
    public static boolean isLocalOnly(String configKey) {
        return configKey != null && LOCAL_ONLY_PAYMENT_BOOL.matcher(configKey.trim()).matches();
    }
}

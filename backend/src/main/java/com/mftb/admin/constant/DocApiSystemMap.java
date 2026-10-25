package com.mftb.admin.constant;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 接口清單的系統歸屬映射：路由前綴 → 正式業務系統（{@link SystemCode}）。
 * <p>
 * 名稱口徑與 {@code SystemPortalSchemaInitializer.seedSystems()} 及前端語言包一致，
 * 只允許中文；接口管理左側禁止回退英文系統代碼，避免對外文檔出現中英混排。
 * <p>
 * 新增系統時必須同步：(1) {@link SystemCode}；(2) 本映射；(3) 門戶種子名稱。
 */
public final class DocApiSystemMap {

    /** 代碼 → 對外中文名（繁體，與門戶系統名稱逐字一致）。 */
    private static final Map<String, String> NAMES = new LinkedHashMap<>();

    static {
        NAMES.put(SystemCode.ADS.code(), "廣告推薦系統");
        NAMES.put(SystemCode.MERCHANT.code(), "商戶運營系統");
        NAMES.put(SystemCode.SELLER.code(), "店鋪經營系統");
        NAMES.put(SystemCode.SEARCH.code(), "搜索運營系統");
        NAMES.put(SystemCode.FINANCE.code(), "財務結算系統");
        NAMES.put(SystemCode.AI.code(), "人工智能系統");
        NAMES.put(SystemCode.HR.code(), "人力資源系統");
        NAMES.put(SystemCode.ATTENDANCE.code(), "考勤假勤系統");
        NAMES.put(SystemCode.EAM.code(), "物資管理系統");
        NAMES.put(SystemCode.RDM.code(), "產研交付系統");
        NAMES.put(SystemCode.OA.code(), "流程審批系統");
        NAMES.put(SystemCode.MEETING.code(), "會議管理系統");
        NAMES.put(SystemCode.IAM.code(), "權限管理系統");
        NAMES.put(SystemCode.PLATFORM.code(), "平台支撐系統");
        NAMES.put(SystemCode.TRANSLATION.code(), "翻譯管理系統");
        NAMES.put(SystemCode.DOC.code(), "文檔中心系統");
    }

    private DocApiSystemMap() {}

    /** 按請求路徑歸屬系統；無法識別的路由統一歸入平台支撐系統。 */
    public static String code(String path) {
        String clean = path == null ? "" : path.replaceFirst("^/api/", "");
        int slash = clean.indexOf('/');
        String first = slash > 0 ? clean.substring(0, slash) : clean;
        return switch (first) {
            case "doc", "word-library" -> SystemCode.DOC.code();
            case "hr", "employee", "employees", "contract", "contracts", "hr-dict", "authorization",
                    "department", "departments", "position", "positions", "org-scope", "organization" ->
                    SystemCode.HR.code();
            case "attendance" -> SystemCode.ATTENDANCE.code();
            case "eam", "asset", "consumable", "vehicle", "company-brands", "purchase-companies" ->
                    SystemCode.EAM.code();
            case "ads", "ad", "gifts", "activity", "flash-sale", "organic-score" -> SystemCode.ADS.code();
            case "finance", "fin", "card-order" -> SystemCode.FINANCE.code();
            case "ai", "agent", "mcp", "llm-usage", "mt-engines" -> SystemCode.AI.code();
            case "rdm" -> SystemCode.RDM.code();
            case "oa", "workflow-config" -> SystemCode.OA.code();
            case "meeting" -> SystemCode.MEETING.code();
            case "iam", "permission", "roles", "menus", "login-logs", "systems", "sys-config",
                    "notifications", "notification-apps", "notification-channels", "data-authorizations" ->
                    SystemCode.IAM.code();
            case "i18n", "translations" -> SystemCode.TRANSLATION.code();
            case "merchant", "merchant-groups" -> SystemCode.MERCHANT.code();
            case "seller", "stores" -> SystemCode.SELLER.code();
            case "search" -> SystemCode.SEARCH.code();
            default -> SystemCode.PLATFORM.code();
        };
    }

    /** 已知系統的中文名；未知代碼返回平台支撐系統，永不返回英文代碼。 */
    public static String name(String systemCode) {
        return NAMES.getOrDefault(systemCode, NAMES.get(SystemCode.PLATFORM.code()));
    }

    public static boolean known(String systemCode) {
        return systemCode != null && NAMES.containsKey(systemCode);
    }

    /**
     * 展示名：已知代碼固定用本映射的正式中文名（門戶名稱不開放自定義）；
     * 未知代碼若庫裡有中文名則沿用，否則歸入平台支撐系統。
     * 英文/空白一律丟棄，避免歷史掃描留下的 {@code agent}、{@code ad} 混入左側導航。
     */
    public static String displayName(String systemCode, String storedName) {
        if (known(systemCode)) return NAMES.get(systemCode);
        if (hasChinese(storedName)) return storedName;
        return name(systemCode);
    }

    /** 系統展示順序（門戶 sort_order 口徑）。 */
    public static int order(String systemCode) {
        int index = 0;
        for (String code : NAMES.keySet()) {
            if (code.equals(systemCode)) return index;
            index++;
        }
        return Integer.MAX_VALUE;
    }

    public static Set<String> codes() {
        return new LinkedHashSet<>(NAMES.keySet());
    }

    private static boolean hasChinese(String value) {
        if (value == null || value.isBlank()) return false;
        return value.codePoints().anyMatch(cp -> Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN);
    }
}

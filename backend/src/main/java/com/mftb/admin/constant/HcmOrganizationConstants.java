package com.mftb.admin.constant;

/**
 * 組織編制系統（organization）常量：菜單 key 與可授動作集的唯一真值。
 * <p>
 * 為什麼要獨立常量類：{@code sys_menu.actions} 決定授權中心能勾出什麼動作，控制器
 * {@code @RequirePermission} 又必須按同一批動作校驗。兩處字面量漂移的後果是
 * 「界面上勾不到、接口卻要求」——超管直通看不出來，普通角色上線當天才 403。
 */
public final class HcmOrganizationConstants {

    private HcmOrganizationConstants() {
    }

    /** 一級菜單：法人主體 */
    public static final String MENU_LEGAL_ENTITY = "hcm-org-legal";

    /** 一級菜單：管理組織 */
    public static final String MENU_UNIT = "hcm-org-unit";

    /** 一級菜單：職務族 */
    public static final String MENU_JOB_FAMILY = "hcm-org-job-family";

    /** 一級菜單：職位職級 */
    public static final String MENU_JOB_GRADE = "hcm-org-job-grade";

    /** 一級菜單：崗位與編制 */
    public static final String MENU_POSITION = "hcm-org-position";

    /** 只讀動作集（列表/詳情） */
    public static final String ACTIONS_VIEW = "[\"view\"]";

    /** 增刪改查動作集（主數據維護頁） */
    public static final String ACTIONS_FULL = "[\"view\",\"create\",\"edit\",\"delete\"]";

    /** 法域取值：與考勤/人事的既有口徑一致，只支持首期三地 */
    public static final String JURISDICTION_CN = "CN";
    public static final String JURISDICTION_HK = "HK";
    public static final String JURISDICTION_MO = "MO";

    /** 組織類型：管理組織與業務單元分開建模，避免把門店直接塞進部門樹 */
    public static final String UNIT_TYPE_COMPANY = "COMPANY";
    public static final String UNIT_TYPE_DEPARTMENT = "DEPARTMENT";
    public static final String UNIT_TYPE_BUSINESS = "BUSINESS_UNIT";
}

package com.mftb.admin.constant;

/**
 * 业务系统编码枚举。
 * <p>
 * 唯一真值来源：{@code docs/system-portal/inventory.md}。新增系统必须同步：
 * (1) 更新本枚举；(2) 更新归属清单文档；(3) 增加 {@code sys_system} 种子迁移；(4) 补测试。
 * <p>
 * {@link #PORTAL} 是哨兵值，用于「個人工作台」/公共入口，不属于业务系统，
 * 系统准入判定遇到 {@code system_code='portal'} 的接口时跳过（仅需登录态）。
 */
public enum SystemCode {

    /** 门户公共入口（个人工作台），不属于业务系统 */
    PORTAL("portal"),
    ADS("ads"),
    MERCHANT("merchant"),
    /** 商家工作台：承接店铺随心推（购买入口与推广报表），与广告推荐系统拆分 */
    SELLER("seller"),
    SEARCH("search"),
    FINANCE("finance"),
    AI("ai"),
    HR("hr"),
    /**
     * 組織編制系統：法人主體、管理組織、職位職級、崗位與編制。
     * <p>从 hr 拆出独立系统：组织/编制是主数据治理面，与员工档案（人事管理）责任不同；
     * 复用 hr 准入会让「看人事档案」自动拿到「改编制」，因此独立 system_code 与独立菜单 key。
     */
    ORGANIZATION("organization"),
    /**
     * 考勤假勤系統：打卡/排班/班次/節假日/異常/請假額度/日報月報。
     * <p>從人力資源系統拆出獨立入口，對齊北森「假勤」/飛書「假勤」/Workday Time Tracking 的產品邊界；
     * 月度匯總凍結後是薪酬核算系統的唯一取數來源。
     */
    ATTENDANCE("attendance"),
    EAM("eam"),
    /** 產研交付系統（RDM）：需求從提交、審批、分配、受理、研發、驗收到上線的全生命周期管理 */
    RDM("rdm"),
    OA("oa"),
    /**
     * 會議管理系統：會議室檔案、全員預約、參與人日程與釘釘邀約。
     * <p>獨立一級域（不併入 OA）的原因：会议室是「資源檔案 + 占用事實」，
     * 与审批流的关系只有一条预留字段；併入 oa 会让行政维护会议室时掉进审批菜单树里。
     * 对标钉钉智能会议室/飞书会议室的独立产品边界。
     */
    MEETING("meeting"),
    IAM("iam"),
    PLATFORM("platform"),
    /** 翻译中心：多语言翻译/语料/质量校验（i18n-center 菜单树，从 platform 拆出独立系统） */
    TRANSLATION("i18n"),
    /**
     * 文檔中心系統：騰訊文檔為內容中台（正文單一事實源），本系統承載元數據索引、
     * 菜單門禁與查閱審計（需求/人事/行政/制度/培訓統一查閱入口）。
     */
    DOC("doc"),
    ;

    private final String code;

    SystemCode(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    /** 按字符串解析；未知返回 null，由调用方判定为「暂未归属」而非默认放行。 */
    public static SystemCode fromCode(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        for (SystemCode sc : values()) {
            if (sc.code.equalsIgnoreCase(code)) {
                return sc;
            }
        }
        return null;
    }

    /** 是否为业务系统（排除哨兵 portal）。 */
    public boolean isBusinessSystem() {
        return this != PORTAL;
    }
}

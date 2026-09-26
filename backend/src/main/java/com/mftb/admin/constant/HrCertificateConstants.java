package com.mftb.admin.constant;

import java.util.Set;

/**
 * 證明開具（ESS 员工自助）域常量：证明类型、单据状态、OA 流程编码、菜单 key、编号规则。
 * <p>
 * 唯一真值来源，禁止业务代码散落魔法字符串。参考 SQL: backend/sql/198_hr_certificate.sql
 */
public final class HrCertificateConstants {

    private HrCertificateConstants() {
    }

    // ==================== 证明类型（HR 字典 CERT_TYPE 的 code） ====================

    /** 在职证明 */
    public static final String TYPE_EMPLOYMENT = "EMPLOYMENT";
    /** 收入证明（金额不由本系统输出，仅登记申请与审批结论） */
    public static final String TYPE_INCOME = "INCOME";
    /** 离职证明 */
    public static final String TYPE_RESIGNATION = "RESIGNATION";
    /** 其他 */
    public static final String TYPE_OTHER = "OTHER";

    /** 字典类型编码（sys_hr_dict.dict_type） */
    public static final String DICT_TYPE = "CERT_TYPE";

    public static final Set<String> ALL_TYPES = Set.of(
            TYPE_EMPLOYMENT, TYPE_INCOME, TYPE_RESIGNATION, TYPE_OTHER);

    // ==================== 证明语种 ====================

    public static final String LANG_ZH = "ZH";
    public static final String LANG_EN = "EN";
    public static final String LANG_BOTH = "BOTH";

    public static final Set<String> ALL_LANGUAGES = Set.of(LANG_ZH, LANG_EN, LANG_BOTH);

    // ==================== 单据状态（与请假/入转调离同口径） ====================

    public static final String STATUS_DRAFT = "draft";
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_CANCELLED = "cancelled";
    /** 已完成：审批通过，进入线下开具/交付环节 */
    public static final String STATUS_COMPLETED = "completed";

    /** 可编辑/可提交/可删除的草稿态 */
    public static final Set<String> EDITABLE_STATUSES =
            Set.of(STATUS_DRAFT, STATUS_REJECTED, STATUS_CANCELLED);

    // ==================== OA 流程、菜单与编号 ====================

    /** 证明开具审批流程编码（biz_oa_process.process_code） */
    public static final String PROCESS_CODE = "hr_certificate";

    /** 员工自助「证明开具」菜单 key（挂在一级域 ess-center 下） */
    public static final String MENU = "ess-certificate";

    /** 证明申请单编号规则 key（ZM + YYYYMMDD + 4位） */
    public static final String SEQ_RULE_KEY = "hr_certificate_request";

    /** 办理结果默认话术：审批通过只代表"同意开具"，出具动作仍由人事线下完成 */
    public static final String ISSUED_REMARK = "審批通過，人事將線下開具並通知領取";

    public static boolean isValidType(String type) {
        return type != null && ALL_TYPES.contains(type);
    }

    /** 语种允许留空（默认中文），非空时必须是已登记值 */
    public static boolean isValidLanguage(String lang) {
        return lang == null || lang.isBlank() || ALL_LANGUAGES.contains(lang);
    }
}

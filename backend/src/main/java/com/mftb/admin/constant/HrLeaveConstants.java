package com.mftb.admin.constant;

import java.util.Set;

/**
 * HR 假期域常量（假期类型 / 请假单据状态 / OA 流程编码 / 菜单 key）。
 * <p>
 * 唯一真值来源，禁止业务代码散落魔法字符串。参考 SQL: backend/sql/197_hr_leave.sql
 */
public final class HrLeaveConstants {

    private HrLeaveConstants() {
    }

    // ==================== 假期类型（HR 字典 LEAVE_TYPE 的 code） ====================

    public static final String TYPE_ANNUAL = "ANNUAL";
    public static final String TYPE_PERSONAL = "PERSONAL";
    public static final String TYPE_SICK = "SICK";
    public static final String TYPE_MARRIAGE = "MARRIAGE";
    public static final String TYPE_MATERNITY = "MATERNITY";
    public static final String TYPE_BEREAVEMENT = "BEREAVEMENT";
    public static final String TYPE_COMPENSATORY = "COMPENSATORY";

    /** 字典类型编码（sys_hr_dict.dict_type） */
    public static final String DICT_TYPE = "LEAVE_TYPE";

    /** 全部合法假期类型 */
    public static final Set<String> ALL_LEAVE_TYPES = Set.of(
            TYPE_ANNUAL, TYPE_PERSONAL, TYPE_SICK, TYPE_MARRIAGE,
            TYPE_MATERNITY, TYPE_BEREAVEMENT, TYPE_COMPENSATORY);

    // ==================== 请假单据状态（与生命周期引擎同口径） ====================

    public static final String STATUS_DRAFT = "draft";
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_CANCELLED = "cancelled";
    /** 已完成：额度已累加到 used_days */
    public static final String STATUS_COMPLETED = "completed";

    /** 可编辑/可提交/可删除的草稿态 */
    public static final Set<String> EDITABLE_STATUSES =
            Set.of(STATUS_DRAFT, STATUS_REJECTED, STATUS_CANCELLED);

    /** 占用额度的在途状态（审批中的单据天数计入"冻结"） */
    public static final Set<String> OCCUPYING_STATUSES =
            Set.of(STATUS_DRAFT, STATUS_PENDING, STATUS_APPROVED);

    // ==================== OA 流程与菜单 ====================

    /** 请假审批复用既有 OA 流程定义 biz_oa_process.oa_leave「請假申請」 */
    public static final String PROCESS_CODE = "oa_leave";

    /** 请假单据菜单 key */
    public static final String MENU_LEAVE = "hr-leave";
    /** 假期额度菜单 key */
    public static final String MENU_QUOTA = "hr-leave-quota";

    /** 两个假期菜单挂载的分组（員工檔案） */
    public static final String MENU_PARENT = "hr-profile";

    /** 请假单编号规则 key（LQ + YYYYMMDD + 4位） */
    public static final String SEQ_RULE_KEY = "hr_leave_request";

    public static boolean isValidType(String type) {
        return type != null && ALL_LEAVE_TYPES.contains(type);
    }
}

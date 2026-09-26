package com.mftb.admin.constant;

import java.util.Map;
import java.util.Set;

/**
 * HR 入转调离生命周期单据常量。
 * <p>
 * 单据类型 / 单据状态 / OA 流程编码 / 菜单 key 的唯一真值来源，
 * 严禁在业务代码中散落魔法字符串。参考 SQL: backend/sql/195_hr_lifecycle.sql
 */
public final class HrLifecycleConstants {

    private HrLifecycleConstants() {
    }

    // ==================== 单据类型 ====================

    /** 入职 */
    public static final String TYPE_ONBOARD = "onboard";
    /** 转正 */
    public static final String TYPE_REGULAR = "regular";
    /** 调动 */
    public static final String TYPE_TRANSFER = "transfer";
    /** 离职 */
    public static final String TYPE_DIMISSION = "dimission";
    /** 合同续签（P0：复用同一引擎，入口与授权归属合同台账） */
    public static final String TYPE_RENEW = "renew";

    /** 全部合法类型 */
    public static final Set<String> ALL_TYPES =
            Set.of(TYPE_ONBOARD, TYPE_REGULAR, TYPE_TRANSFER, TYPE_DIMISSION, TYPE_RENEW);

    /** 单据类型 → 关联 OA 流程编码（biz_oa_process.process_code） */
    public static final Map<String, String> TYPE_TO_PROCESS_CODE = Map.of(
            TYPE_ONBOARD, "hr_onboard",
            TYPE_REGULAR, "hr_regular",
            TYPE_TRANSFER, "hr_transfer",
            TYPE_DIMISSION, "hr_dimission",
            TYPE_RENEW, "hr_renew");

    /** OA 流程编码 → 单据类型（回调分发用） */
    public static final Map<String, String> PROCESS_CODE_TO_TYPE = Map.of(
            "hr_onboard", TYPE_ONBOARD,
            "hr_regular", TYPE_REGULAR,
            "hr_transfer", TYPE_TRANSFER,
            "hr_dimission", TYPE_DIMISSION,
            "hr_renew", TYPE_RENEW);

    /** 单据类型 → 前端功能授权菜单 key（sys_menu.menu_key） */
    public static final Map<String, String> TYPE_TO_MENU_KEY = Map.of(
            TYPE_ONBOARD, "hr-onboarding",
            TYPE_REGULAR, "hr-regularization",
            TYPE_TRANSFER, "hr-transfer",
            TYPE_DIMISSION, "hr-dimission",
            // 续签不单独建菜单：入口、列表与数据都在合同台账页
            TYPE_RENEW, "contract-ledger");

    // ==================== 单据状态 ====================

    /** 草稿（未提交审批） */
    public static final String STATUS_DRAFT = "draft";
    /** 审批中（已提交 OA 流程） */
    public static final String STATUS_PENDING = "pending";
    /** 审批通过（等待/正在执行办理动作） */
    public static final String STATUS_APPROVED = "approved";
    /** 审批驳回（可修改后重新提交） */
    public static final String STATUS_REJECTED = "rejected";
    /** 已撤销（OA 流程撤销，单据回到草稿） */
    public static final String STATUS_CANCELLED = "cancelled";
    /** 已完成（办理动作执行完毕） */
    public static final String STATUS_COMPLETED = "completed";

    // ==================== 离职类型 ====================

    /** 主动离职 */
    public static final String DIMISSION_VOLUNTARY = "voluntary";
    /** 被动离职 */
    public static final String DIMISSION_INVOLUNTARY = "involuntary";
    /** 合同到期 */
    public static final String DIMISSION_EXPIRED = "expired";

    public static final Set<String> ALL_DIMISSION_TYPES =
            Set.of(DIMISSION_VOLUNTARY, DIMISSION_INVOLUNTARY, DIMISSION_EXPIRED);

    // ==================== 合同状态（emp_contract.status，UI 展示繁体与此值一致） ====================

    /** 合同状态: 生效中 */
    public static final String CONTRACT_STATUS_ACTIVE = "生效中";
    /** 合同状态: 已终止（续签通过后旧合同置此值） */
    public static final String CONTRACT_STATUS_TERMINATED = "已终止";

    // ==================== 职务记录操作类型（emp_position_record.operation） ====================
    /*
     * 注意：库内 operation 存的是简体值（见 EmployeeServiceImpl.insertInitialPositionRecord
     * 写 '入职'、EmployeeServiceImpl.getLatestOperations 派生在职状态比较 '离职'），
     * 而 UI 展示名为繁体（入職/離職）。写库必须用下列常量，否则员工列表
     * 「在职状态」不会转为已离职（E2E 实测踩坑）。
     */

    /** 职务记录操作: 入职 */
    public static final String OPERATION_ONBOARD = "入职";
    /** 职务记录操作: 转正 */
    public static final String OPERATION_REGULAR = "转正";
    /** 职务记录操作: 调动 */
    public static final String OPERATION_TRANSFER = "调动";
    /** 职务记录操作: 离职 */
    public static final String OPERATION_DIMISSION = "离职";

    // ==================== 单据编号规则 ====================

    /** sys_biz_seq_rule.rule_key: RS + YYYYMMDD + 4位自增序号 */
    public static final String SEQ_RULE_KEY = "hr_lifecycle_request";

    /** 入职单据办理时为新员工生成的初始登录密码前缀（MF+工号后4位，HR 可事后重置） */
    public static final String DEFAULT_PASSWORD_PREFIX = "MF";

    /** 校验单据类型是否合法 */
    public static boolean isValidType(String type) {
        return type != null && ALL_TYPES.contains(type);
    }
}

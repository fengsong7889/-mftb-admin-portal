package com.mftb.admin.constant;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 用车管理领域常量（状态、来源、动作与允许的跳转）
 *
 * <p>与前端 {@code src/pages/VehicleManagement/vehicleTypes.ts} 一一对应：
 * 两侧取值集合必须一致，改一边必须改另一边，否则会出现前端能选、后端拒绝的死角。
 *
 * <p>用字符串而不是整型：EAM 域既有表（biz_eam_claim/borrow/return 的 status）就是字符串状态，
 * 车辆域跟齐同一口径，避免同一模块里"资产用字符串、用车用整型"两套查表方式。
 * 数据库侧以 CHECK 约束兜住取值集合。
 */
public final class VehicleConstants {

    private VehicleConstants() {
    }

    /* ==================== 菜单与动作 ==================== */

    public static final String MENU_FILES = "vehicle-files";
    public static final String MENU_DISPATCH = "vehicle-dispatch";
    public static final String MENU_LEDGER = "vehicle-ledger";
    public static final String MENU_MY_USE = "my-vehicle-use";

    public static final String ACTION_VIEW = "view";
    public static final String ACTION_CREATE = "create";
    public static final String ACTION_EDIT = "edit";
    public static final String ACTION_EXPORT = "export";

    /* ==================== 数据来源 ==================== */

    public static final String SOURCE_OA = "oa_approval";
    public static final String SOURCE_DIRECT = "direct_register";
    public static final String SOURCE_BACKFILL = "backfill";

    /* ==================== 审批结论 ==================== */

    public static final String APPROVAL_NOT_SUBMITTED = "not_submitted";
    public static final String APPROVAL_APPROVING = "approving";
    public static final String APPROVAL_APPROVED = "approved";
    public static final String APPROVAL_REJECTED = "rejected";
    public static final String APPROVAL_CANCELLED = "cancelled";
    /** 授权直接登记：不得伪装成 approved，否则台账无法区分管控强度 */
    public static final String APPROVAL_DIRECT = "direct";
    /** 补录场景：事前审批不适用 */
    public static final String APPROVAL_NOT_APPLICABLE = "not_applicable";

    /* ==================== 用车单业务状态 ==================== */

    public static final String STATUS_DRAFT = "draft";
    public static final String STATUS_APPROVING = "approving";
    public static final String STATUS_TO_ASSIGN = "to_assign";
    /** 已安排：形成有效占用，但尚未实际出车 */
    public static final String STATUS_TO_DEPART = "to_depart";
    public static final String STATUS_IN_USE = "in_use";
    public static final String STATUS_TO_CONFIRM = "to_confirm";
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_CANCELLED = "cancelled";

    /**
     * 会占用车辆/驾驶人的状态集合。
     *
     * <p>必须与 VehicleMapper 里占用检查 SQL 的 IN 列表保持一致 —— 两处不一致会同时
     * 出现「能重复派车」和「明明空车却报冲突」两种相反的错误，是最危险的隐性耦合。
     */
    public static final Set<String> OCCUPYING_STATUSES =
            Set.of(STATUS_TO_DEPART, STATUS_IN_USE, STATUS_TO_CONFIRM);

    /**
     * 车管待办的在途状态集合：未指定分组时的默认可见范围。
     *
     * <p>列表与顶部统计卡必须共用这一份定义，否则会出现「卡片说有 8 条、列表只给 5 条」。
     */
    public static final Set<String> DISPATCH_STATUSES =
            Set.of(STATUS_TO_ASSIGN, STATUS_TO_DEPART, STATUS_IN_USE, STATUS_TO_CONFIRM);

    /* ==================== 办理分组（Tab 徽标与列表 group 参数共用同一口径） ==================== */

    public static final String GROUP_TO_ASSIGN = STATUS_TO_ASSIGN;
    public static final String GROUP_TO_DEPART = STATUS_TO_DEPART;
    public static final String GROUP_IN_USE = STATUS_IN_USE;
    /** 待归还确认：已据实登记归还、等待车管核对归档 */
    public static final String GROUP_TO_CONFIRM = "to_confirm";
    /** 补录待核对：补录单或与时段/里程冲突进入争议核对的单 */
    public static final String GROUP_BACKFILL = "backfill";
    /** 全部办理中：含审批中，不含已完成/驳回/取消 */
    public static final String GROUP_ALL = "all";

    /** 待办分组顺序：统计卡与 Tab 徽标按此顺序一次算完 */
    public static final List<String> DISPATCH_GROUPS = List.of(
            GROUP_TO_ASSIGN, GROUP_TO_DEPART, GROUP_IN_USE, GROUP_TO_CONFIRM, GROUP_BACKFILL, GROUP_ALL);

    /** 「全部办理中」额外含审批中：审批通过后才会进入四个在途状态 */
    public static final Set<String> PROCESSING_STATUSES = Set.of(
            STATUS_APPROVING, STATUS_TO_ASSIGN, STATUS_TO_DEPART, STATUS_IN_USE, STATUS_TO_CONFIRM);

    /** 显式状态跳转表：禁止任意跳转 */
    private static final Map<String, Set<String>> TRANSITIONS = Map.ofEntries(
            Map.entry(STATUS_DRAFT, Set.of(STATUS_APPROVING, STATUS_TO_ASSIGN, STATUS_CANCELLED)),
            Map.entry(STATUS_APPROVING, Set.of(STATUS_TO_ASSIGN, STATUS_REJECTED, STATUS_CANCELLED)),
            Map.entry(STATUS_TO_ASSIGN, Set.of(STATUS_TO_DEPART, STATUS_CANCELLED)),
            // to_depart → to_assign 允许改派；已出车不可回退
            Map.entry(STATUS_TO_DEPART, Set.of(STATUS_IN_USE, STATUS_TO_ASSIGN, STATUS_CANCELLED)),
            // 已出车只能据实归还，不能取消、不能重新派车
            Map.entry(STATUS_IN_USE, Set.of(STATUS_TO_CONFIRM)),
            // 核对不通过时留在待确认（补录被驳回后重新核对），不倒退回出车前
            Map.entry(STATUS_TO_CONFIRM, Set.of(STATUS_COMPLETED, STATUS_TO_CONFIRM)),
            Map.entry(STATUS_COMPLETED, Set.of()),
            Map.entry(STATUS_REJECTED, Set.of()),
            Map.entry(STATUS_CANCELLED, Set.of()));

    /** 状态机判定：from 为 null 或目标不在允许集内一律拒绝 */
    public static boolean canTransition(String from, String to) {
        Set<String> allowed = TRANSITIONS.get(from);
        return allowed != null && allowed.contains(to);
    }

    /* ==================== 车辆运行状态 ==================== */

    public static final String VEHICLE_NORMAL = "normal";
    public static final String VEHICLE_REPAIRING = "repairing";
    public static final String VEHICLE_SUSPENDED = "suspended";
    public static final String VEHICLE_RETIRED = "retired";

    /* ==================== 行程状态 ==================== */

    public static final String TRIP_DEPARTED = "departed";
    public static final String TRIP_RETURNED = "returned";
    /** 已确认：唯一计入正式台账与统计的状态 */
    public static final String TRIP_CONFIRMED = "confirmed";
    /** 补录待核对：不计入正式汇总 */
    public static final String TRIP_PENDING_CHECK = "pending_check";
    /** 与既有记录冲突，争议核对中 */
    public static final String TRIP_DISPUTED = "disputed";

    /* ==================== 附加标识 ==================== */

    public static final String FLAG_OVERDUE = "overdue";
    public static final String FLAG_BACKFILL = "backfill";
    public static final String FLAG_CORRECTED = "corrected";
    public static final String FLAG_MILEAGE_ANOMALY = "mileage_anomaly";
    public static final String FLAG_KEY_PENDING = "key_pending";
    public static final String FLAG_CONDITION_ABNORMAL = "condition_abnormal";

    /* ==================== 驾驶方式与资格 ==================== */

    public static final String MODE_SELF = "self";
    public static final String MODE_COMPANY_DRIVER = "company_driver";

    public static final String QUAL_VERIFIED = "verified";
    public static final String QUAL_PENDING = "pending";
    public static final String QUAL_EXPIRED = "expired";

    /* ==================== 审计动作 ==================== */

    public static final String EVENT_APPLY = "apply";
    public static final String EVENT_ASSIGN = "assign";
    public static final String EVENT_DIRECT_REGISTER = "direct_register";
    public static final String EVENT_DEPART = "depart";
    public static final String EVENT_RETURN = "return";
    public static final String EVENT_CONFIRM = "confirm";
    public static final String EVENT_BACKFILL = "backfill";
    public static final String EVENT_CORRECT = "correct";
    public static final String EVENT_CONFIG_CHANGE = "config_change";
    public static final String EVENT_QUAIL_VERIFY = "qual_verify";

    /* ==================== 编号规则前缀映射 ==================== */

    /**
     * 按数据来源取单号规则。
     *
     * <p>三个来源统一走 vehicle_use（YC），前缀不再是路径标识。原因：曾以为 ZC/BL 能让人
     * 一眼看出单据来路，但三条规则各自计数——只把前缀改成相同就会让审批单与直接登记单
     * 在同一天各自从 0001 开起，直接撞 uk_vehicle_use_no。共用一个序列才能既统一前缀又不重号；
     * 路径区分仍看得到，它在 source 列与列表「來源」列里。
     */
    public static String seqRuleOf(String source) {
        return com.mftb.admin.util.BizSeqService.RULE_VEHICLE_USE;
    }
}

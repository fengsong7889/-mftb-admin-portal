package com.mftb.admin.constant;

/**
 * 考勤假勤域常量（菜单 key 与授权动作真值）。
 * <p>
 * 唯一真值来源，禁止业务代码散落魔法字符串。参考 SQL：{@code backend/sql/228_attendance_system.sql}，
 * 实际菜单落地由 {@code AttendanceMenuInitializer} 以 {@code applyOnce("attendance:menu:v1.0", task, verify)} 负责。
 * <p>
 * 动作集必须与后续 Controller 的 {@code @RequirePermission(action=...)} 一一对应：
 * {@code sys_menu.actions} 决定授权中心「功能操作」面板能勾出什么，缺一个动作就永远授不出去
 * （超管靠代码直通看不出问题，普通角色上线当天才会暴露）。
 */
public final class AttendanceConstants {

    private AttendanceConstants() {
    }

    // ==================== 分组菜单 key（type=1，无 path/component） ====================

    /** 考勤管理分组：日常操作（考勤组/排班/打卡/异常） */
    public static final String GROUP_OPS = "attendance-ops-group";

    /** 基础设置分组：低频配置（班次/节假日） */
    public static final String GROUP_BASIC = "attendance-basic-group";

    /** 请假管理分组：独立业务域（请假单/额度） */
    public static final String GROUP_LEAVE = "attendance-leave-group";

    /** 报表统计分组：汇总输出（日报/月报） */
    public static final String GROUP_REPORT = "attendance-report-group";

    // ==================== 菜单 key（system_code=attendance） ====================

    /** 假勤工作台：指标与预警，待办只跳转流程事项，不承载审批动作（独立顶级，不挂分组） */
    public static final String MENU_WORKBENCH = "attendance-workbench";

    /** 考勤组与规则：考勤结论的最小计算单位（成员范围 + 考勤地 + 班次 + 宽限 + 来源） */
    public static final String MENU_GROUP = "attendance-group";

    /** 班次管理 */
    public static final String MENU_SHIFT = "attendance-shift";

    /** 节假日日历：改变应出勤基数与加班倍率 */
    public static final String MENU_HOLIDAY = "attendance-holiday";

    /** 排班管理：员工 × 日期 × 班次 */
    public static final String MENU_SCHEDULE = "attendance-schedule";

    /** 打卡记录：只读账本，不提供人工修改 */
    public static final String MENU_PUNCH = "attendance-punch";

    /** 异常处理：指派处理方式并回显结果，申请本身走流程中心 */
    public static final String MENU_EXCEPTION = "attendance-exception";

    /** 考勤日报：按日期 × 考勤组的计算结论 */
    public static final String MENU_DAILY = "attendance-daily";

    /** 月度考勤汇总：冻结后交数给薪酬核算 */
    public static final String MENU_MONTHLY = "attendance-monthly";

    /** 假勤设置：口径参数（不含审批流程配置） */
    public static final String MENU_SETTING = "attendance-setting";

    // ==================== 从人力资源系统迁入的既有菜单 ====================

    /**
     * 请假管理与假期额度：沿用原 menu_key/path/actions。
     * <p>key 与 path 一旦改变，存量 {@code sys_role_menu}/{@code sys_department_menu} 授权行、
     * 历史单据里的流程锚点、以及用户收藏链接都会失配，因此本次只改挂载父级与 system_code。
     */
    public static final String MENU_LEAVE = "hr-leave";
    public static final String MENU_LEAVE_QUOTA = "hr-leave-quota";

    /** 这两个请假菜单的历史父级（員工檔案分组），re-parent 时作为「当前仍挂在原处」的判定条件 */
    public static final String LEGACY_LEAVE_PARENT = "hr-profile";

    // ==================== 授权动作集（写入 sys_menu.actions 的 JSON 字面量） ====================

    public static final String ACTIONS_VIEW = "[\"view\"]";
    public static final String ACTIONS_VIEW_EXPORT = "[\"view\",\"export\"]";
    public static final String ACTIONS_VIEW_IMPORT_EXPORT = "[\"view\",\"import\",\"export\"]";
    public static final String ACTIONS_VIEW_EDIT = "[\"view\",\"edit\"]";
    public static final String ACTIONS_VIEW_EDIT_IMPORT_EXPORT = "[\"view\",\"edit\",\"import\",\"export\"]";
    public static final String ACTIONS_VIEW_EXPORT_EDIT = "[\"view\",\"edit\",\"export\"]";
    public static final String ACTIONS_FULL = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    public static final String ACTIONS_HOLIDAY = "[\"view\",\"create\",\"edit\",\"delete\",\"import\"]";

    // ==================== 编号规则 key（sys_biz_seq_rule.rule_key） ====================

    /** 考勤组编号：AG + YYYYMM + 4 位序号 */
    public static final String SEQ_GROUP = "attendance_group";

    /** 月度汇总批次号：AT + YYYYMM + 4 位序号（冻结时生成） */
    public static final String SEQ_MONTHLY_BATCH = "attendance_monthly_batch";

    /**
     * 补卡/加班不在此登记编号规则：它们走流程审批系统，单号由 OA 流程统一发出
     * （{@code biz_oa_request.flow_no}），考勤侧只存引用，不自建序列。
     */

    // ==================== 口径参数（sys_config.config_key） ====================

    /*
     * 只登记「引擎真的会读」的参数。两类文案不入 sys_config：
     * ① 口径说明（计算粒度、旷工规则、来源优先级、留存年限）——改了没人读就是假闭环；
     * ② 迟到/早退宽限——真值在考勤组（att_group.late_grace_min / early_grace_min），
     *    再弄一个全局默认值会出现「设置页改了但判定不变」，因此设置页只作只读说明。
     */

    /** 加班起算门槛（分钟）：下班后超过该时长才计加班 */
    public static final String CFG_OVERTIME_THRESHOLD_MIN = "attendance.overtime_threshold_minutes";

    /** 加班进位步长（分钟）：不足一个步长舍去 */
    public static final String CFG_OVERTIME_STEP_MIN = "attendance.overtime_step_minutes";

    /** 月度汇总冻结日（次月第几日）：工作台据此提醒未冻结月份 */
    public static final String CFG_FREEZE_DAY = "attendance.monthly_freeze_day";

    /** 加班起算门槛默认值 */
    public static final int DEFAULT_OVERTIME_THRESHOLD_MIN = 30;

    /** 加班进位步长默认值（0.5 小时） */
    public static final int DEFAULT_OVERTIME_STEP_MIN = 30;

    /** 冻结日默认值：次月 3 日 */
    public static final int DEFAULT_FREEZE_DAY = 3;
}

package com.mftb.admin.constant;

import java.util.List;
import java.util.Set;

/**
 * 会议管理系统（meeting）常量。
 *
 * <p><b>为什么区间语义必须在常量层钉住</b>：预约冲突判定同时存在于三处
 * （Mapper 的重叠 SQL、服务层校验、前端忙闲视图渲染），任何一处把右边界从"开"写成"闭"，
 * 就会出现 10:00–11:00 与 11:00–12:00 两场会议互相冲突（或该冲突却不冲突）的对称错误。
 * 因此这里同时提供 {@link #OCCUPYING_STATUSES} 与 {@link #canTransition}，
 * 让"什么状态算占用""允许怎么推进"只有一个真值来源。
 *
 * <p>状态设计取舍：
 * <ul>
 *   <li>不存 {@code in_progress}：进行中由 {@code start_time <= now < end_time} 派生，
 *       落库就要每分钟全表更新，且与"是否已签到"这一事实纠缠不清；</li>
 *   <li>{@code released}（被释放）与 {@code cancelled}（被取消）分列：前者是爽约（占过窗口没来，
 *       计入使用率分母与爽约统计），后者是主动撤销（窗口还给其他人）。合并成一个状态，
 *       行政就再也分不清"房间被白占"和"会议被取消"；</li>
 *   <li>{@code approvalOutcome}/{@code approval_required} 为未来开启审批预留，本期服务端不读取。</li>
 * </ul>
 */
public final class MeetingConstants {

    private MeetingConstants() {
    }

    /* ==================== 菜单 key（与 MeetingMenuInitializer 种子一一对应） ==================== */

    /** 我的会议：员工视角的日程与邀约响应 */
    public static final String MENU_MY = "meeting-my";
    /** 会议室预约：忙闲视图 + 新建预约 */
    public static final String MENU_BOOKING = "meeting-booking";
    /** 会议室档案：行政维护资源台账 */
    public static final String MENU_ROOM = "meeting-room";
    /** 预约记录：全量记录 + 代订 + 手动释放 */
    public static final String MENU_RECORD = "meeting-record";
    /** 使用率看板（M3） */
    public static final String MENU_REPORT = "meeting-report";
    /** 预约规则（M2） */
    public static final String MENU_CONFIG = "meeting-config";

    /* ==================== 授权动作 ==================== */

    public static final String ACTION_VIEW = "view";
    public static final String ACTION_CREATE = "create";
    public static final String ACTION_EDIT = "edit";
    public static final String ACTION_EXPORT = "export";

    /** sys_menu.actions 种子真值 */
    public static final String ACTIONS_VIEW_EDIT = "[\"view\",\"edit\"]";
    public static final String ACTIONS_VIEW_EDIT_EXPORT = "[\"view\",\"edit\",\"export\"]";
    public static final String ACTIONS_VIEW_EXPORT = "[\"view\",\"export\"]";
    /** 会议室档案动作集（M1 不含 export：没有导出接口就登记 export，等于授出一个接口上不存在的权限） */
    public static final String ACTIONS_ROOM = "[\"view\",\"create\",\"edit\"]";
    /** M2 起的写动作集：签到/释放/取消都走 edit，导出在 M3 看板交付时一并补 */
    public static final String ACTIONS_CONFIG = "[\"view\",\"edit\"]";

    /* ==================== 会议状态机 ==================== */

    public static final String STATUS_BOOKED = "booked";
    public static final String STATUS_CHECKED_IN = "checked_in";
    public static final String STATUS_FINISHED = "finished";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_RELEASED = "released";

    /**
     * 占用会议室窗口的状态集合。
     *
     * <p>必须与 Mapper 里重叠判定 SQL 的状态列表逐字一致：不一致会同时出现
     * 「能重复订同一间房」和「房间空着却报冲突」两种方向相反的错误。
     */
    public static final List<String> OCCUPYING_STATUSES = List.of(STATUS_BOOKED, STATUS_CHECKED_IN);

    /**
     * 尚未开始的预约（可改期/可取消）
     */
    public static final Set<String> STATUS_EDITABLE = Set.of(STATUS_BOOKED);

    /** 允许签到或取消的窗口内状态（已收尾/已终止的单不再接受任何参会动作） */
    public static final Set<String> STATUS_OPEN = Set.of(STATUS_BOOKED, STATUS_CHECKED_IN);

    /** 允许的状态跳转表：键为当前状态，值为可达状态 */
    private static final java.util.Map<String, Set<String>> TRANSITIONS = java.util.Map.of(
            STATUS_BOOKED, Set.of(STATUS_CHECKED_IN, STATUS_CANCELLED, STATUS_RELEASED, STATUS_FINISHED),
            STATUS_CHECKED_IN, Set.of(STATUS_FINISHED, STATUS_CANCELLED),
            STATUS_FINISHED, Set.of(),
            STATUS_CANCELLED, Set.of(),
            STATUS_RELEASED, Set.of());

    /** 状态推进白名单：未登记的跳转一律拒绝，避免任何入口都能把单据改成任意状态 */
    public static boolean canTransition(String from, String to) {
        Set<String> allowed = TRANSITIONS.get(from);
        return allowed != null && allowed.contains(to);
    }

    /* ==================== 会议室状态与设备 ==================== */

    public static final String ROOM_ACTIVE = "active";
    public static final String ROOM_MAINTENANCE = "maintenance";
    public static final String ROOM_DISABLED = "disabled";

    /** 设备代码：前端下拉与 facilities 列的逗号包裹格式共用同一套代码 */
    public static final List<String> FACILITY_CODES = List.of(
            "PROJECTION", "WHITEBOARD", "VIDEO_TERMINAL", "PHONE", "WIRELESS_CAST");

    /* ==================== 关联业务类型 ==================== */

    public static final String BIZ_GENERAL = "general";
    /** 产研需求评审（M3 联动） */
    public static final String BIZ_RDM_REVIEW = "rdm_review";
    public static final String BIZ_INTERVIEW = "interview";
    public static final String BIZ_TRAINING = "training";

    public static final Set<String> BIZ_TYPES = Set.of(
            BIZ_GENERAL, BIZ_RDM_REVIEW, BIZ_INTERVIEW, BIZ_TRAINING);

    /* ==================== 参会人 ==================== */

    public static final String ATTENDEE_ORGANIZER = "organizer";
    public static final String ATTENDEE_REQUIRED = "required";
    public static final String ATTENDEE_OPTIONAL = "optional";
    public static final String ATTENDEE_EXTERNAL = "external";

    public static final String RESPOND_PENDING = "pending";
    public static final String RESPOND_ACCEPTED = "accepted";
    public static final String RESPOND_DECLINED = "declined";
    public static final String RESPOND_INVALID = "invalid";

    public static final String NOTIFY_PENDING = "pending";
    public static final String NOTIFY_SENT = "sent";
    public static final String NOTIFY_SKIPPED = "skipped";
    public static final String NOTIFY_FAILED = "failed";

    /* ==================== 审计事件编码 ==================== */

    public static final String EVENT_CREATE = "create";
    public static final String EVENT_UPDATE = "update";
    public static final String EVENT_CANCEL = "cancel";
    public static final String EVENT_CHECKIN = "checkin";
    public static final String EVENT_RELEASE = "release";
    public static final String EVENT_FINISH = "finish";
    public static final String EVENT_NOTIFY = "notify";
    public static final String EVENT_ROOM_CREATE = "room_create";
    public static final String EVENT_ROOM_UPDATE = "room_update";
    public static final String EVENT_ROOM_DELETE = "room_delete";
    /** 周期系列：创建物化 / 按档取消 / 模板变更 */
    public static final String EVENT_SERIES_CREATE = "series_create";
    public static final String EVENT_SERIES_CANCEL = "series_cancel";
    public static final String EVENT_SERIES_UPDATE = "series_update";
    /** 规则与黑名单变更（全局配置没有业务实体可挂，单独落轨迹） */
    public static final String EVENT_CONFIG_UPDATE = "config_update";
    public static final String EVENT_BLACKLIST_ADD = "blacklist_add";
    public static final String EVENT_BLACKLIST_REVOKE = "blacklist_revoke";

    /** 系统触发的动作（自动释放/收尾），审计里必须与人工操作分得开 */
    public static final String OPERATOR_SYSTEM = "SYSTEM";

    /* ==================== 通知场景与事件码 ==================== */

    /** 邀约：创建/变更/取消/参会人增减 */
    public static final String SCENARIO_INVITE = "meeting_invite";
    /** 开始前提醒 */
    public static final String SCENARIO_REMIND = "meeting_remind";
    /** 释放/爽约/管理员操作告知组织者 */
    public static final String SCENARIO_OPS = "meeting_ops";

    /** 变更邀约的事件码按预约版本递增（见 updateEventCode）；M2 签到/释放/收尾也留痕 */
    public static final String NOTIFY_EVT_CHECKED_IN = "ops_checked_in";
    public static final String NOTIFY_EVT_FINISHED = "ops_finished";

    /** 投递留痕的事件码：与 {@code uk_meeting_notify_dedup} 一起构成"同一事件只投一次"的底线 */
    public static final String NOTIFY_EVT_CREATED = "invite_created";
    public static final String NOTIFY_EVT_UPDATED = "invite_updated";
    public static final String NOTIFY_EVT_CANCELLED = "invite_cancelled";
    public static final String NOTIFY_EVT_REMIND = "remind_before_start";
    public static final String NOTIFY_EVT_RELEASED = "ops_released";

    /**
     * 变更邀约的事件码按预约版本号递增。
     *
     * <p>固定码会让「第二次改期」撞上 {@code uk_meeting_notify_dedup}：插入被 IGNORE，
     * 参会人永远只收到第一次邀约。提醒类不能用这个口径（同一场会只提醒一次），
     * 所以只对 invite_updated 生效。
     */
    public static String updateEventCode(int version) {
        return NOTIFY_EVT_UPDATED + "_v" + Math.max(1, version);
    }

    /* ==================== 周期会议系列（M2） ==================== */

    public static final String FREQ_DAILY = "daily";
    public static final String FREQ_WEEKLY = "weekly";
    public static final Set<String> SERIES_FREQS = Set.of(FREQ_DAILY, FREQ_WEEKLY);

    /** 单次物化的实例硬上限：配置写 1000 次也只能建 100 场，防止一个误操作把预约表埋了 */
    public static final int SERIES_MAX_OCCURRENCES = 100;
    /** 物化时向后探的最大天数（即使 occurrence_limit 未满）：没有上界的日期递增会让循环活在理论上 */
    public static final int SERIES_MAX_SPAN_DAYS = 400;

    /** 系列状态 */
    public static final String SERIES_ACTIVE = "active";
    public static final String SERIES_CANCELLED = "cancelled";

    /**
     * 三档取消语义。
     * <p>{@code future} 含当日之后未开始的实例，{@code this} 只动当前一条，{@code all} 包含历史；
     * 但三者都**不改写已结束的实例**——历史事实一旦被重写，当天的审计轨迹就不再是当时发生的事。
     */
    public static final String CANCEL_THIS = "this";
    public static final String CANCEL_FUTURE = "future";
    public static final String CANCEL_ALL = "all";
    public static final Set<String> CANCEL_SCOPES = Set.of(CANCEL_THIS, CANCEL_FUTURE, CANCEL_ALL);

    /* ==================== 预约黑名单（M2） ==================== */

    public static final String BLACKLIST_ACTIVE = "active";
    public static final String BLACKLIST_REVOKED = "revoked";
    /** 来源：系统按阈值自动 / 行政手动 */
    public static final String BLACKLIST_SOURCE_AUTO = "auto";
    public static final String BLACKLIST_SOURCE_ADMIN = "admin";
    /** 爽约统计窗口（天）：只统计近 30 天，不让半年前的一次失约跟着人一辈子 */
    public static final int NO_SHOW_WINDOW_DAYS = 30;

    /* ==================== 编号与配置键 ==================== */

    /** sys_biz_seq_rule.rule_key */
    public static final String SEQ_BOOKING = "meeting_booking";
    /** 周期系列编号 rule_key */
    public static final String SEQ_SERIES = "meeting_series";

    /** sys_config 全局默认规则键（房间级列为 NULL 时回落到这里） */
    public static final String CFG_ADVANCE_DAYS = "meeting_advance_days";
    public static final String CFG_MIN_LEAD_MINUTES = "meeting_min_lead_minutes";
    public static final String CFG_DEFAULT_DURATION = "meeting_default_duration";
    public static final String CFG_MAX_DURATION = "meeting_max_duration_minutes";
    public static final String CFG_TIME_GRANULARITY = "meeting_time_granularity";
    public static final String CFG_BOOKABLE_START = "meeting_bookable_start_time";
    public static final String CFG_BOOKABLE_END = "meeting_bookable_end_time";
    public static final String CFG_REMIND_MINUTES = "meeting_remind_minutes";
    public static final String CFG_CHECKIN_OPEN_MINUTES = "meeting_checkin_open_minutes";
    public static final String CFG_RELEASE_AFTER = "meeting_release_after_minutes";
    public static final String CFG_NO_SHOW_THRESHOLD = "meeting_no_show_threshold";
    public static final String CFG_BLACKLIST_DAYS = "meeting_blacklist_days";
    /** 免登签到令牌的 HMAC 密钥（首次使用时懒生成，与领用签署密钥分开：换一把不该让另一类链接失效） */
    public static final String CFG_CHECKIN_TOKEN_SECRET = "meeting_checkin_token_secret";
}

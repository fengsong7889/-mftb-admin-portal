package com.mftb.admin.service;

import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.SysUser;

import java.time.LocalDate;
import java.util.List;

/**
 * 会议预约服务（会议室窗口占用的唯一写入方）。
 *
 * <p>职责边界：预约单的创建/变更/取消、冲突与并发防护、参会人与邀约投递、我的日程。
 * 会议室档案归 {@link MeetingRoomService}，规则默认值归 {@link MeetingRuleService}，
 * "谁能看/谁能改"归 {@link MeetingAccessGuard}——本服务只做一件事：
 * <b>让"占用一间房的一个窗口"这件事在任何并发下都只成立一次</b>。
 *
 * <p>写入路径固定为：锁房间行 → 幂等键复查 → 规则校验 → 房间窗口冲突 → 组织者同时段冲突 →
 * 插入 → 参会人落库 → 审计 → 提交后投递邀约。顺序不可调换：先校验后插入才有"冲突就整体失败"的语义，
 * 先投递后提交则会把不存在的会议通知出去。
 */
public interface MeetingBookingService {

    /** 列表 + 同口径统计卡（统计必须跟随当前筛选条件，见 AGENTS.md §E.8） */
    MeetingBookingDto.PageWithStats listWithStats(MeetingBookingDto.Query query);

    /** 单场会议详情（含参会人、邀约投递状态、审计轨迹）；非相关人 fail-closed 拒绝 */
    MeetingBookingDto.VO detail(long id);

    /** 新建预约：免审批即时占用窗口，重复提交由 requestKey 幂等挡回 */
    MeetingBookingDto.CreateResult create(MeetingBookingDto.CreateForm form);

    /** 改期/换房/改参会人：先版本比对再释放旧窗口，同事务内完成，避免中间态被抢占 */
    MeetingBookingDto.VO update(long id, MeetingBookingDto.UpdateForm form);

    /** 取消会议：原因必填，窗口立即归还可被别人重订 */
    void cancel(long id, MeetingBookingDto.CancelForm form);

    /** 参会人响应邀约（接受/拒绝）：只能替自己表态 */
    MeetingBookingDto.VO respond(long id, MeetingBookingDto.ResponseForm form);

    /** 我某一天的日程（日历视图单元格数据，含我发起与我参与） */
    List<MeetingBookingDto.ScheduleVO> schedule(LocalDate date);

    /** 首页与「我的会议」顶部摘要 */
    MeetingBookingDto.MySummary mySummary();

    /** 一场会议的审计轨迹（详情页「操作记录」） */
    List<MeetingBookingDto.EventVO> events(long id);

    /* ==================== M2：签到 / 提前结束 / 释放 ==================== */

    /**
     * 签到（本人或行政代签）：写入参会人个人签到时间，并把会议推入 checked_in。
     *
     * <p>窗口 = 开始前 {@code meeting_checkin_open_minutes} 至开始后房间释放分钟数；
     * 超出窗口直接拒绝而不是“签上就行”，否则自动释放作业与爽约统计就永远无法相信签到数据。
     */
    MeetingBookingDto.VO checkin(long id);

    /**
     * 以指定参会人身份签到（免登签到页专用）。
     *
     * <p>与 {@link #checkin(long)} 共用同一套窗口与状态机实现，只是身份来源不同：
     * 常规入口取 JWT，免登入口只能取 HMAC 令牌里绑定的那个人。两条路径若各写一遍，
     * 迟早出现"网页签到要校验窗口、扫码签到不校验"的分裂。
     */
    MeetingBookingDto.VO checkinAs(long id, SysUser participant);

    /**
     * 免登签到页读取会议状态用：以指定用户身份算出"现在能不能签"。
     *
     * <p>不走 {@code detail()}：那里从 JWT 取当前登录人，而免登页没有登录态，
     * 拿令牌里的人去顶 JWT 等于伪造身份。
     */
    MeetingBookingDto.VO stateForCheckin(long id, SysUser participant);

    /** 提前结束：写 actual_end_at 并把状态推入 finished，剩余窗口立即归还可被重订 */
    MeetingBookingDto.VO finish(long id);

    /** 行政手动释放（记操作人与原因，与系统自动释放的事实列分开） */
    MeetingBookingDto.VO release(long id, MeetingBookingDto.ReleaseForm form);

    /**
     * 系统自动释放（超时未签到）：爽约事实记 no_show=1 且 release_by_id 为 NULL。
     *
     * <p>与手动释放共用一个入口而不是两套代码：两者对状态机、窗口归还与通知的要求完全相同，
     * 分两处写迟早出现“手动释放会发通知、自动释放不发”这类口径差异。
     */
    boolean releaseAsNoShow(MeetingBooking booking, String reason);

    /**
     * 周期会议物化单场实例：与手工新建共用同一套规则校验、冲突判定、参会人与审计。
     *
     * @return 实际占用的单；{@code null} 表示该场次与其他占用冲突而被跳过
     *         （规则不合法与数据库异常一律抛出不降级为跳过，否则会把配置错误静默变成“少建了几场”）
     */
    /**
     * 物化周期会议的一场实例。
     *
     * <p>调用方把已解析好的实际使用人（行政代订）传进来而不是在这里再查一次：
     * 一个 100 场的系列会就会多 100 次用户查询与 100 次权限判定，
     * 而代订资格本应在系列创建时一次性裁定，实例阶段只负责落窗口。无代订时传 null。
     */
    MeetingBooking materializeInstance(MeetingBookingDto.CreateForm form, SysUser organizer, SysUser delegate,
                                     Long seriesId, int seriesSeq);

    /* ==================== 供定时作业调用的单元操作 ==================== */

    /**
     * 超时未签到、待释放的会议（房间启用签到时）。
     *
     * <p>作业层负责逐条调用 {@link #releaseAsNoShow}，而不是在这里做整批事务：
     * 一批释放里有一场失败时，其余的应该照常生效——整体回滚会让"下一轮重试"变成
     * "下一轮全部重来并且可能全部再失败"。
     */
    List<MeetingBooking> findReleasable(int limit);

    /** 即将开始、待提醒的会议（提醒幂等靠通知留痕唯一键，不在这里判） */
    List<MeetingBooking> findRemindDue(int limit);

    /** 已过结束时间但仍标为占用中的单（每日收尾候选） */
    List<MeetingBooking> findStaleOccupying(int limit);

    /** 系统收尾：不要求签到、也不计爽约，只把窗口状态推到 finished（每日 00:10 作业使用） */
    boolean finishAsSystem(MeetingBooking booking);

    /** 把未来会议里已停用账号的参会人标失效，返回处理行数（历史会议不碰） */
    int markDeactivatedAttendees(int limit);

    /** 某场会议的邀约收件人（必参+选参，排除组织者与外部人） */
    List<Long> receiversOf(long bookingId);

    /**
     * 模板级规则校验（周期创建前置检查）：不受最远可订天数限制，其余规则照旧。
     *
     * <p>不通过就直接抛，绝不返回"跳过"：模板本身非法时应该拒绝整个系列，
     * 而不是一百场里静默少几场。
     */
    void validateTemplate(com.mftb.admin.entity.MeetingRoom room, java.time.LocalDateTime start,
                          java.time.LocalDateTime end, int attendeeCount);

    /** 周期系列只给第一场发邀约（避免同一份名单被 N 遍轰炸），由系列服务在物化完成后调用 */
    MeetingNotifyDispatcher.EnqueueResult notifySeriesFirstInvite(MeetingBooking booking);

    /** 系列详情的实例视图：与预约列表同一套 VO 口径，不另建一套字段 */
    MeetingBookingDto.VO viewForSeries(MeetingBooking booking, SysUser current);
}

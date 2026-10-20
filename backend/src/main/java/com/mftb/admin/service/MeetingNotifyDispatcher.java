package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingNotifyLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingNotifyLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 会议通知投递器：登记留痕 → 事务提交后投递 → 失败退避重试。
 *
 * <p>四条硬口径：
 * <ol>
 *   <li><b>登记与业务同事务，发送在提交之后</b>：预约回滚了却把邀约发出去，参会人会收到一场不存在的会议；
 *       反之提交后发不出去也必须留在队列里等补发，不能静默丢；</li>
 *   <li><b>success = 渠道已受理</b>，不是"方法调用返回了"。{@code sendWorkNotification} 是异步的，
 *       结果通过 {@code whenComplete} 回调落状态，绝不在调用返回时就写 success；</li>
 *   <li><b>不静默跳过</b>：场景未启用、未绑定钉钉都写一行 skipped 并留原因，
 *       详情页据此告诉组织者"N 人未送达，原因是什么"；</li>
 *   <li><b>多实例安全</b>：靠 {@code claim} 条件更新抢占，不依赖 GET_LOCK 与连接的绑定关系。</li>
 * </ol>
 *
 * <p>测试/联调环境可设 {@code meeting.notify.dry-run=true}：照常登记与流转状态但不真发，
 * 避免把内部会议邀约推到真实钉钉。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingNotifyDispatcher {

    /** 最大尝试次数（含首次）：与既有 RDM 队列口径一致，耗尽后停止并告警，等人工补发 */
    static final int MAX_ATTEMPTS = 3;
    /** 各次失败后的重试间隔（分钟） */
    static final int[] BACKOFF_MINUTES = {1, 5, 30};

    /** 场景未启用/未绑定等跳过原因，详情页与排查都要能直接读懂 */
    static final String REASON_SCENARIO_OFF = "場景未啟用或未綁定企業應用";
    static final String REASON_NOT_BOUND = "未綁定釘釘";

    private static final int NOTE_MAX_LENGTH = 200;
    private static final int ERROR_MAX_LENGTH = 500;

    private final MeetingNotifyLogMapper notifyMapper;
    private final MeetingAttendeeMapper attendeeMapper;
    private final MeetingBookingMapper bookingMapper;
    private final SysUserMapper userMapper;
    private final NotificationAppService appService;
    private final DingTalkAppService dingTalkAppService;
    private final MeetingNotifyTemplateService templateService;

    @Value("${meeting.notify.dry-run:false}")
    private boolean dryRun;

    /** 登记结果：queued=已进入投递队列，skipped=留痕但未发（原因见 reason） */
    @Getter
    public static class EnqueueResult {
        private final int queued;
        private final int skipped;
        /** 场景未启用时为 false：前端据此提示"邀約未發送，請在通知配置啟用場景" */
        private final boolean scenarioActive;

        EnqueueResult(int queued, int skipped, boolean scenarioActive) {
            this.queued = queued;
            this.skipped = skipped;
            this.scenarioActive = scenarioActive;
        }
    }

    /**
     * 场景是否已启用且绑定了可用应用（与本次到底投递了几个人无关）。
     *
     * <p>幂等重放（同一 requestKey 再点一次）不会重新登记投递，但前端仍需要知道
     * 场景状态来选提示文案，因此单独暴露这个只读口径。
     */
    public boolean scenarioActive(String scenario) {
        return appService.resolve(scenario) != null;
    }

    /**
     * 登记并投递一批会议通知。
     *
     * @param booking        会议单（内容全部从单据字段渲染，通知不接受调用方拼正文，防止把敏感值带进卡片）
     * @param eventCode      {@code MeetingConstants.NOTIFY_EVT_*}；变更类事件用 {@code updateEventCode(version)}
     * @param scenario       {@code meeting_invite}/{@code meeting_remind}/{@code meeting_ops}
     * @param receiverIds    接收人 sys_user.id（组织者自己不在名单里就不通知他）
     * @param detailLine     变更/取消差异说明，可为空
     */
    public EnqueueResult enqueue(MeetingBooking booking, String eventCode, String scenario,
                                 Collection<Long> receiverIds, String detailLine) {
        if (booking == null || booking.getId() == null || !StringUtils.hasText(eventCode)) {
            return new EnqueueResult(0, 0, false);
        }
        Set<Long> ids = new LinkedHashSet<>();
        if (receiverIds != null) {
            receiverIds.stream().filter(Objects::nonNull).forEach(ids::add);
        }
        if (ids.isEmpty()) {
            return new EnqueueResult(0, 0, appService.resolve(scenario) != null);
        }

        // 场景路由先解析：未启用时整批记 skipped 而不是"什么都不写"，
        // 否则行政永远无法从数据里回答"那批邀约到底发没发"
        NotificationAppService.Credentials app = appService.resolve(scenario);
        boolean scenarioActive = app != null;
        String skipReason = scenarioActive ? null : REASON_SCENARIO_OFF;

        List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .in(SysUser::getId, ids));
        int queued = 0;
        int skipped = 0;
        List<Long> pendingIds = new ArrayList<>();
        for (SysUser user : users) {
            String dingtalkId = user.getDingtalkUserId();
            boolean bound = StringUtils.hasText(dingtalkId);
            boolean deliverable = scenarioActive && bound && !dryRun;
            String status = deliverable ? MeetingConstants.NOTIFY_PENDING : MeetingConstants.NOTIFY_SKIPPED;
            String reason = deliverable ? null
                    : !scenarioActive ? skipReason : !bound ? REASON_NOT_BOUND : "dry-run 開關已啟用";
            int inserted = notifyMapper.insertIgnore(booking.getId(), booking.getBookingNo(), eventCode, scenario,
                    user.getId(), displayName(user), Objects.toString(user.getEmpId(), ""),
                    bound ? dingtalkId.trim() : "", status,
                    deliverable ? LocalDateTime.now() : null, truncate(reason, ERROR_MAX_LENGTH));
            if (inserted == 0) {
                // 已存在同一（会议, 事件, 人）：说明这一事件已登记过，重复提交不再补发
                log.info("會議通知已登記過，跳過重複投递: bookingNo={}, event={}, userId={}",
                        booking.getBookingNo(), eventCode, user.getId());
                continue;
            }
            if (deliverable) {
                queued++;
                MeetingNotifyLog row = notifyMapper.findByDedupKey(booking.getId(), eventCode, user.getId());
                if (row != null && row.getId() != null) {
                    pendingIds.add(row.getId());
                }
            } else {
                skipped++;
            }
            attendeeMapper.updateNotifyForUser(booking.getId(), user.getId(), status,
                    statusNote(status, reason));
        }
        // 名单里查不到的人（账号被删/ID 传错）：必须显式记一条 skipped，
        // 否则"少发了一个人"在数据里完全看不出来
        int missing = ids.size() - users.size();
        if (missing > 0) {
            skipped += missing;
            log.warn("會議通知名單有 {} 人在系統中查不到，已從投递名單剔除: bookingNo={}, event={}",
                    missing, booking.getBookingNo(), eventCode);
        }
        submitAfterCommit(pendingIds);
        return new EnqueueResult(queued, skipped, scenarioActive);
    }

    /** 提交后异步投递：回滚的事务不该发出通知，通知失败也绝不影响已生效的预约 */
    private void submitAfterCommit(List<Long> logIds) {
        if (logIds.isEmpty()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    logIds.forEach(MeetingNotifyDispatcher.this::dispatch);
                }
            });
        } else {
            logIds.forEach(this::dispatch);
        }
    }

    /** 单条投递：异步提交，不占用业务请求线程 */
    @Async
    public void dispatch(Long logId) {
        send(logId);
    }

    /**
     * 执行一条投递任务。
     *
     * <p>可被首次发送与重试作业共用；抢不到任务时静默返回（说明另一路已在处理或已终态）。
     * 状态由渠道回调写，因此本方法返回不代表已投递完成。
     */
    public void send(Long logId) {
        if (logId == null || notifyMapper.claim(logId) == 0) {
            return;
        }
        MeetingNotifyLog task = notifyMapper.selectById(logId);
        if (task == null) {
            log.warn("會議通知任務已消失但狀態為投遞中: id={}", logId);
            return;
        }
        int attempts = task.getRetryCount() == null ? 1 : task.getRetryCount() + 1;
        if (!StringUtils.hasText(task.getReceiverDingtalkId())) {
            notifyMapper.markSkipped(logId, REASON_NOT_BOUND);
            writeBackAttendee(task, MeetingConstants.NOTIFY_SKIPPED, REASON_NOT_BOUND);
            return;
        }
        // 排队期间场景被停用或改绑：不发送，也不回退到任何默认应用
        NotificationAppService.Credentials app = appService.resolve(task.getScenario());
        if (app == null) {
            notifyMapper.markSkipped(logId, REASON_SCENARIO_OFF);
            writeBackAttendee(task, MeetingConstants.NOTIFY_SKIPPED, REASON_SCENARIO_OFF);
            return;
        }
        MeetingBooking booking = bookingMapper.selectById(task.getBookingId());
        if (booking == null) {
            notifyMapper.markSkipped(logId, "會議單據不存在");
            writeBackAttendee(task, MeetingConstants.NOTIFY_SKIPPED, "會議單據不存在");
            return;
        }
        String title = buildTitle(booking, task.getEventCode());
        String content = buildContent(booking, task.getEventCode(), app.getBaseUrl());
        try {
            dingTalkAppService.sendWorkNotification(task.getScenario(), app.getId(),
                            List.of(task.getReceiverDingtalkId()), title, content)
                    .whenComplete((accepted, error) -> applyOutcome(task, attempts, accepted, error));
        } catch (RuntimeException e) {
            // 提交动作本身异常（线程池拒绝等）：按失败退避，不能让任务永久停在投遞中
            applyOutcome(task, attempts, false, e);
        }
    }

    /** 渠道回调落状态：受理即 success，未受理按退避重试，耗尽后停止等待人工补发 */
    void applyOutcome(MeetingNotifyLog task, int attempts, Boolean accepted, Throwable error) {
        Long logId = task == null ? null : task.getId();
        if (logId == null) {
            return;
        }
        try {
            if (Boolean.TRUE.equals(accepted)) {
                notifyMapper.markSuccess(logId);
                // 成功也要回写参会人行：只有 log 表前进的话，详情页会长期并排展示
                // 「参会人：待發送」与「投递明细：已送達」两套相互否定的事实
                writeBackAttendee(task, MeetingConstants.NOTIFY_SENT, null);
                return;
            }
            String message = error != null ? error.getClass().getSimpleName() + ": " + error.getMessage()
                    : "渠道未受理（返回 false，可能憑證失效或接收人不存在）";
            if (attempts >= MAX_ATTEMPTS) {
                String exhausted = truncate("重試耗盡：" + message, ERROR_MAX_LENGTH);
                notifyMapper.markFailed(logId, exhausted, null);
                writeBackAttendee(task, MeetingConstants.NOTIFY_FAILED, truncate(message, NOTE_MAX_LENGTH));
                log.error("會議通知重試耗盡，需人工補發: id={}, attempts={}, error={}", logId, attempts, message);
                return;
            }
            int waitMinutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
            notifyMapper.markFailed(logId, truncate(message, ERROR_MAX_LENGTH),
                    LocalDateTime.now().plusMinutes(waitMinutes));
            // 退避中同样是“现在还没送到”，参会人行跟着标失败，回写不能只写终态
            writeBackAttendee(task, MeetingConstants.NOTIFY_FAILED, truncate(message, NOTE_MAX_LENGTH));
            log.warn("會議通知未受理，{} 分鐘後重試: id={}, attempts={}", waitMinutes, logId, attempts);
        } catch (RuntimeException e) {
            log.error("會議通知狀態回寫失敗: id={}, error={}", logId, e.getMessage());
        }
    }

    /**
     * 把投递结果回写到参会人行。
     *
     * <p>词表翻译发生在这里：log 表用 {@code success}，而 {@code biz_meeting_attendee.notify_status}
     * 的 DDL CHECK 只接受 pending/sent/skipped/failed，直接写 success 会撞约束。
     *
     * <p>无系统账号的外部参会人与组织者不在接收人名册里（enqueue 不给他们建留痕行），
     * 因此这里天然不会抹掉「組織者本人不發送邀約」这类已定的说明。
     */
    private void writeBackAttendee(MeetingNotifyLog task, String status, String note) {
        if (task == null || task.getBookingId() == null || task.getReceiverUserId() == null) {
            return;
        }
        try {
            attendeeMapper.updateNotifyForUser(task.getBookingId(), task.getReceiverUserId(), status, note);
        } catch (RuntimeException e) {
            // 回写失败不能把投递结果抹掉：留痕行已是事实，明细页仍可对账
            log.warn("會議通知回寫參會人行失敗: bookingId={}, userId={}, status={}, error={}",
                    task.getBookingId(), task.getReceiverUserId(), status, e.getMessage());
        }
    }

    /** 到期待投递任务（供重试作业使用） */
    public List<Long> dueIds(int limit) {
        return notifyMapper.findDueIds(limit, MAX_ATTEMPTS);
    }

    /** 回收卡在投递中的任务（执行者重启遗留） */
    public int recoverStuck(int stuckMinutes) {
        return notifyMapper.recoverStuck(stuckMinutes);
    }

    /** 一场会议的投递明细（详情页「通知投递状态」） */
    public List<MeetingNotifyLog> listByBooking(long bookingId) {
        return notifyMapper.findByBooking(bookingId);
    }

    /* ==================== 卡片内容 ==================== */

    /**
     * 事件 → 模板场景。
     * <p>只有「邀約/變更」走 invite、「開始前提醒」走 remind，其余（取消/釋放/签退等）走 ops；
     * 三个场景的默认模板里都留有 ${extraLine}，用来装“原定安排已失效”这类事件专属的一句话。
     */
    private static String sceneOf(String eventCode) {
        if (eventCode == null) {
            return MeetingConstants.SCENARIO_OPS;
        }
        if (eventCode.startsWith(MeetingConstants.NOTIFY_EVT_UPDATED)
                || MeetingConstants.NOTIFY_EVT_CREATED.equals(eventCode)) {
            return MeetingConstants.SCENARIO_INVITE;
        }
        if (MeetingConstants.NOTIFY_EVT_REMIND.equals(eventCode)) {
            return MeetingConstants.SCENARIO_REMIND;
        }
        return MeetingConstants.SCENARIO_OPS;
    }

    private String buildTitle(MeetingBooking booking, String eventCode) {
        MeetingNotifyTemplateService.Rendered rendered =
                templateService.render(sceneOf(eventCode), templateVars(booking, eventCode, null));
        return rendered != null && StringUtils.hasText(rendered.title())
                ? rendered.title() : eventLabel(eventCode) + "：" + booking.getTitle();
    }

    /** 模板变量：全部取自会议单，不接受调用方传自由正文（防止议程里的内部信息被拼进推送） */
    private Map<String, String> templateVars(MeetingBooking booking, String eventCode, String baseUrl) {
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("meetingTitle", Objects.toString(booking.getTitle(), ""));
        vars.put("meetingNo", Objects.toString(booking.getBookingNo(), ""));
        vars.put("startTime", DateTimeUtils.format(booking.getStartTime()));
        vars.put("endTime", DateTimeUtils.format(booking.getEndTime()));
        vars.put("roomName", Objects.toString(booking.getRoomName(), ""));
        vars.put("roomLocation", StringUtils.hasText(booking.getRoomLocation())
                ? "（" + booking.getRoomLocation() + "）" : "");
        vars.put("organizer", Objects.toString(booking.getOrganizerName(), ""));
        vars.put("delegateLine", StringUtils.hasText(booking.getDelegateForName())
                ? "實際使用人：**" + booking.getDelegateForName() + "**（由 "
                        + Objects.toString(booking.getOrganizerName(), "") + " 代訂）\n" : "");
        vars.put("agendaLine", StringUtils.hasText(booking.getDescription())
                ? "議程：" + truncate(booking.getDescription(), 200) + "\n" : "");
        vars.put("onlineLine", StringUtils.hasText(booking.getOnlineMeetingUrl())
                ? "線上會議：[點擊進入](" + booking.getOnlineMeetingUrl() + ")\n" : "");
        String extra = "";
        if (isChange(eventCode)) {
            extra = "\n**請以最新時間為準，原定安排已失效。**\n";
        } else if (MeetingConstants.NOTIFY_EVT_CANCELLED.equals(eventCode)) {
            extra = "\n**本場會議已取消，無需到場。**\n";
        } else if (MeetingConstants.NOTIFY_EVT_RELEASED.equals(eventCode)) {
            extra = "\n**會議室已被釋放，如需使用請重新預約。**\n";
        }
        vars.put("extraLine", extra);
        vars.put("reason", MeetingConstants.NOTIFY_EVT_RELEASED.equals(eventCode)
                ? "會議室已釋放" : eventLabel(eventCode));
        String link = meetingDetailUrl(baseUrl, booking.getId());
        vars.put("viewUrl", link == null ? "" : link);
        return vars;
    }

    /**
     * 渲染 Markdown 卡片。
     *
     * <p>字段全部取自会议单，不接受调用方传入的自由正文：通知一旦能带任意文本，
     * 议程里的内部信息就会原样出现在钉钉推送日志里。
     */
    private String buildContent(MeetingBooking booking, String eventCode, String baseUrl) {
        // 模板优先：管理员在「通知模板」页改完即生效；模板停用/缺失时回落到下面的内置文案
        MeetingNotifyTemplateService.Rendered rendered =
                templateService.render(sceneOf(eventCode), templateVars(booking, eventCode, baseUrl));
        if (rendered != null && StringUtils.hasText(rendered.body())) {
            return rendered.body();
        }
        StringBuilder sb = new StringBuilder();
        sb.append("**").append(eventLabel(eventCode)).append("**<br><br>");
        sb.append("會議主題：").append(booking.getTitle()).append("<br>");
        sb.append("會議單號：").append(booking.getBookingNo()).append("<br>");
        sb.append("開始時間：").append(DateTimeUtils.format(booking.getStartTime())).append("<br>");
        sb.append("結束時間：").append(DateTimeUtils.format(booking.getEndTime())).append("<br>");
        sb.append("會議室：").append(Objects.toString(booking.getRoomName(), "")).append("<br>");
        if (StringUtils.hasText(booking.getRoomLocation())) {
            sb.append("位置：").append(booking.getRoomLocation()).append("<br>");
        }
        sb.append("組織者：").append(Objects.toString(booking.getOrganizerName(), "")).append("<br>");
        // 代订必须写明：参会人看到组织者是行政名字会以为是行政召集，
        // 少了这一行真正的召集人（实际使用人）在通知里就隐身了
        if (StringUtils.hasText(booking.getDelegateForName())) {
            sb.append("實際使用人：").append(booking.getDelegateForName())
                    .append("（由 ").append(Objects.toString(booking.getOrganizerName(), "")).append(" 代訂）<br>");
        }
        if (StringUtils.hasText(booking.getOnlineMeetingUrl())) {
            sb.append("線上會議：[點擊進入](").append(booking.getOnlineMeetingUrl()).append(")<br>");
        }
        if (StringUtils.hasText(booking.getDescription())) {
            sb.append("議程：").append(truncate(booking.getDescription(), 200)).append("<br>");
        }
        if (isChange(eventCode)) {
            sb.append("<br>請以最新時間為準，原定安排已失效。");
        } else if (MeetingConstants.NOTIFY_EVT_CANCELLED.equals(eventCode)) {
            sb.append("<br>本場會議已取消，無需到場。");
        } else if (MeetingConstants.NOTIFY_EVT_RELEASED.equals(eventCode)) {
            sb.append("<br>會議室已被釋放，如需使用請重新預約。");
        }
        String link = meetingDetailUrl(baseUrl, booking.getId());
        if (link != null) {
            sb.append("<br>[查看會議詳情](").append(link).append(")");
        }
        return sb.toString();
    }

    private static String eventLabel(String eventCode) {
        if (eventCode == null) {
            return "會議通知";
        }
        if (eventCode.startsWith(MeetingConstants.NOTIFY_EVT_UPDATED)) {
            return "會議變更";
        }
        return switch (eventCode) {
            case MeetingConstants.NOTIFY_EVT_CREATED -> "會議邀約";
            case MeetingConstants.NOTIFY_EVT_CANCELLED -> "會議取消";
            case MeetingConstants.NOTIFY_EVT_REMIND -> "會議即將開始";
            case MeetingConstants.NOTIFY_EVT_RELEASED -> "會議室已釋放";
            default -> "會議通知";
        };
    }

    private static boolean isChange(String eventCode) {
        return eventCode != null && eventCode.startsWith(MeetingConstants.NOTIFY_EVT_UPDATED);
    }

    /** 详情页跳转：管理后台是 HashRouter，query 必须写在 #/ 之内才会被路由识别 */
    private static String meetingDetailUrl(String baseUrl, Long bookingId) {
        if (!StringUtils.hasText(baseUrl) || bookingId == null) {
            return null;
        }
        String base = baseUrl.trim();
        while (base.endsWith("/") || base.endsWith("#")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/#/meeting-detail?id=" + bookingId;
    }

    private static String displayName(SysUser user) {
        return StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername();
    }

    /** 参会人行的投递说明：skipped 才写原因，pending 留空，避免详情页出现"待发送：未綁定釘釘"这种矛盾 */
    private static String statusNote(String status, String reason) {
        if (!MeetingConstants.NOTIFY_SKIPPED.equals(status)) {
            return null;
        }
        return truncate(reason, NOTE_MAX_LENGTH);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }

    /** 提醒时间换算：开始前 remindMinutes 是否已到（供 M2 提醒 Job 使用） */
    public static boolean remindDue(MeetingBooking booking, int remindMinutes, LocalDateTime now) {
        if (booking == null || booking.getStartTime() == null) {
            return false;
        }
        LocalDateTime threshold = booking.getStartTime().minusMinutes(remindMinutes);
        return !now.isBefore(threshold) && now.isBefore(booking.getStartTime());
    }

    /** 会议是否仍在占用窗口内（终态单不再发提醒） */
    public static boolean isOccupying(MeetingBooking booking) {
        return booking != null && MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus());
    }

    /** 参会人名单（通知与详情页共用取数入口） */
    public List<MeetingAttendee> attendeesOf(long bookingId) {
        return attendeeMapper.findByBooking(bookingId);
    }

    /** 两次会议的时间差描述（变更卡片用），无变化返回空串 */
    public static String timeShiftText(MeetingBooking before, MeetingBooking after) {
        if (before == null || after == null) {
            return "";
        }
        boolean timeChanged = !Objects.equals(before.getStartTime(), after.getStartTime())
                || !Objects.equals(before.getEndTime(), after.getEndTime());
        if (!timeChanged) {
            return "";
        }
        return "原：" + DateTimeUtils.format(before.getStartTime()) + "–"
                + DateTimeUtils.format(before.getEndTime())
                + " → 新：" + DateTimeUtils.format(after.getStartTime()) + "–"
                + DateTimeUtils.format(after.getEndTime());
    }

    /** 时长（分钟），用于卡片与统计；入参非法时返回 0 而不是抛异常 */
    public static int durationMinutes(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || end.isBefore(start)) {
            return 0;
        }
        return (int) Duration.between(start, end).toMinutes();
    }
}

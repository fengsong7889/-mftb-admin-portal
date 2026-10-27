package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesDelivery;
import com.mftb.admin.entity.MeetingMinutesSend;
import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.entity.SysNotificationSwitch;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesDeliveryMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.MeetingMinutesSendMapper;
import com.mftb.admin.mapper.SysNotificationChannelMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkService.SendOutcome;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * 会议纪要投递器：登记留痕 → 事务提交后投递 → 失败退避重试。
 *
 * <p>与 {@code MeetingNotifyDispatcher} 同构，但刻意不复用它的 {@code enqueue()}：
 * 那边的硬口径是"正文一律由会议单渲染、不接受调用方拼正文"，而纪要正文天生就是记录人写的，
 * 硬塞进去等于把那条不变量改掉——以后没人能相信"通知里不会出现任意文本"。
 *
 * <p>四条口径一条不动：
 * <ol>
 *   <li>登记与业务同事务，发送在 {@code afterCommit} 之后（回滚的事务不能把纪要发出去）；</li>
 *   <li>{@code success = 渠道已受理}，由回调写，不在调用返回时就写成功；</li>
 *   <li>不静默跳过：场景未启用、未绑定钉钉、群渠道停用都写一行 skipped 并留原因；</li>
 *   <li>多实例安全靠 {@code claim} 条件更新抢占，不依赖命名锁。</li>
 * </ol>
 *
 * <p>联调可开 {@code meeting.minutes.dry-run=true}：照常登记与流转状态但不真发，
 * 免得把内部纪要推到真实钉钉群。
 *
 * <p><b>与方案的一处有意偏离（已登记例外）</b>：方案写的是“收件人按 100 人分批”，实现是
 * <b>逐人一发</b>（每次调用 userid_list 只装 1 人）。原因：工作通知 API 只返回一个受理结果，
 * 一批 100 人共享同一个结论，那 100 行明细只能写同一个状态，“谁没收到”从留痕里消失——
 * 而这正是“N 人未收到邀约”那类现场问题唯一能回答的手段。逐人一发每人一份受理/失败原因，
 * 更接近事实；单次接收人数固定在 1 人，天然不会碰官方“单次 ≤ 5000 人”上限。
 * 代价是几十次异步外调（已走 @Async 线程池，并由批次上限 30 条约束），到期时：本需求生命周期内。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingMinutesDispatcher {

    /** 最大尝试次数（含首次），与邀约投递同口径 */
    static final int MAX_ATTEMPTS = 3;
    static final int[] BACKOFF_MINUTES = {1, 5, 30};

    static final String REASON_SCENARIO_OFF = "場景未啟用或未綁定企業應用";
    static final String REASON_NOT_BOUND = "未綁定釘釘";
    static final String REASON_CHANNEL_UNUSABLE = "釘釘群渠道不存在或已停用";
    static final String REASON_DRY_RUN = "dry-run 開關已啟用";
    /** 推送开关被关：与“场景未启用”分开写，前者是临时静音、后者是没配应用 */
    static final String REASON_SWITCH_OFF = "推送開關已關閉（靜音）";
    private static final int ERROR_MAX_LENGTH = 500;

    private final MeetingMinutesMapper minutesMapper;
    private final MeetingMinutesSendMapper sendMapper;
    private final MeetingMinutesDeliveryMapper deliveryMapper;
    private final SysUserMapper userMapper;
    private final SysNotificationChannelMapper channelMapper;
    private final NotificationAppService appService;
    private final DingTalkAppService dingTalkAppService;
    private final DingTalkService dingTalkService;
    private final MeetingNotifyTemplateService templateService;

    @Value("${meeting.minutes.dry-run:false}")
    private boolean dryRun;

    /** 登记结论：给前端三分支提示用（进了队列 / 被跳过 / 场景根本没开） */
    @Getter
    public static class RegisterResult {
        /**
         * 进了投递队列的个人数，**不含群**。
         * <p>群只有一个 webhook，把它计进人数会让界面写出「已提交投递 2 条」而实际只发给了 1 个人，
         * 正好是会议域上次踩过的那类“数字与事实对不上”的误导。群是否进队列看 {@code groupQueued}。
         */
        private int queued;
        private int skipped;
        private boolean scenarioActive;
        private boolean groupQueued;
        private final List<MeetingMinutesDelivery> rows = new ArrayList<>();

        void addQueued() {
            queued++;
        }

        void addSkipped() {
            skipped++;
        }
    }

    /**
     * 登记一个批次的投递明细（群 + 收件人），并返回进了队列的数量。
     *
     * <p>必须在业务事务内调用：明细行与批次行是同一条事实的两半，分开提交会出现"有批次没明细"。
     */
    public RegisterResult register(MeetingMinutes minutes, MeetingMinutesSend send, Collection<Long> receiverUserIds) {
        RegisterResult result = new RegisterResult();
        NotificationAppService.Credentials app = appService.resolve(MeetingConstants.SCENARIO_MINUTES);
        result.scenarioActive = app != null;
        // 静音与”没绑定应用“是两件事：静音时场景仍算 active，但一行也不进队列，
        // 并在原因里写清楚，免得行政以为是凭据坏了。
        boolean workOn = templateService.enabled(MeetingConstants.SCENARIO_MINUTES,
                SysNotificationSwitch.CHANNEL_WORK);
        boolean groupOn = templateService.enabled(MeetingConstants.SCENARIO_MINUTES,
                SysNotificationSwitch.CHANNEL_GROUP);

        if (send.getGroupChannelId() != null) {
            SysNotificationChannel channel = usableChannel(send.getGroupChannelId());
            boolean deliverable = channel != null && groupOn && !dryRun;
            String status = deliverable ? MeetingConstants.NOTIFY_PENDING : MeetingConstants.NOTIFY_SKIPPED;
            String reason = deliverable ? null
                    : (channel == null ? REASON_CHANNEL_UNUSABLE : !groupOn ? REASON_SWITCH_OFF : REASON_DRY_RUN);
            int inserted = deliveryMapper.insertGroupIgnore(send.getId(), minutes.getId(), minutes.getBookingId(),
                    send.getGroupChannelId(), Objects.toString(send.getGroupChannelName(), ""), status,
                    deliverable ? LocalDateTime.now() : null, reason);
            if (inserted > 0) {
                if (deliverable) {
                    // 群行不计进 queued（见 RegisterResult.queued 的注释），只单独标 groupQueued
                    result.groupQueued = true;
                } else {
                    result.addSkipped();
                }
                result.rows.add(findRow(send.getId(), MeetingConstants.MINUTES_TARGET_GROUP,
                        MeetingConstants.MINUTES_GROUP_RECEIVER));
            }
        }

        Set<Long> ids = new LinkedHashSet<>();
        if (receiverUserIds != null) {
            receiverUserIds.stream().filter(Objects::nonNull).filter(id -> id > 0).forEach(ids::add);
        }
        if (ids.isEmpty()) {
            scheduleAfterCommit(send.getId());
            return result;
        }
        List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>().in(SysUser::getId, ids));
        for (SysUser user : users) {
            String dingtalkId = user.getDingtalkUserId();
            boolean bound = StringUtils.hasText(dingtalkId);
            boolean deliverable = result.scenarioActive && bound && workOn && !dryRun;
            String status = deliverable ? MeetingConstants.NOTIFY_PENDING : MeetingConstants.NOTIFY_SKIPPED;
            String reason = deliverable ? null
                    : !workOn ? REASON_SWITCH_OFF
                    : !result.scenarioActive ? REASON_SCENARIO_OFF
                    : !bound ? REASON_NOT_BOUND : REASON_DRY_RUN;
            int inserted = deliveryMapper.insertUserIgnore(send.getId(), minutes.getId(), minutes.getBookingId(),
                    user.getId(), displayName(user), Objects.toString(user.getEmpId(), ""),
                    Objects.toString(user.getDepartment(), ""),
                    bound ? dingtalkId.trim() : "", MeetingConstants.SCENARIO_MINUTES, status,
                    deliverable ? LocalDateTime.now() : null, reason);
            if (inserted == 0) {
                // 同一批次同一个人只有一行：撞键说明已经登记过，不重复计数也不重复发
                log.info("紀要投遞明細已存在，跳過重複登记: sendId={}, userId={}", send.getId(), user.getId());
                continue;
            }
            if (deliverable) {
                result.addQueued();
            } else {
                result.addSkipped();
            }
            result.rows.add(findRow(send.getId(), MeetingConstants.MINUTES_TARGET_USER, user.getId()));
        }
        int missing = ids.size() - users.size();
        if (missing > 0) {
            result.skipped += missing;
            log.warn("紀要收件名單有 {} 人在系統中查不到，已從投递名單剔除: minutesId={}", missing, minutes.getId());
        }
        // 登记完先回算一次批次结论：全被跳过时一行都不进队列，也就永远不会有投递回调来算这件事。
        // 不补这一步，场景未启用时发送历史会永远停在「發送中」且三个计数全为 0。
        sendMapper.refreshOutcome(send.getId());
        scheduleAfterCommit(send.getId());
        return result;
    }

    /** 提交后异步投递：整个批次一次扫描，避免逐条注册回调把线程池占满 */
    private void scheduleAfterCommit(long sendId) {
        Runnable dispatch = () -> dueIdsOfSend(sendId).forEach(this::dispatch);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch.run();
                }
            });
        } else {
            dispatch.run();
        }
    }

    private List<Long> dueIdsOfSend(long sendId) {
        List<MeetingMinutesDelivery> rows = deliveryMapper.findBySend(sendId);
        return rows.stream()
                .filter(row -> MeetingConstants.NOTIFY_PENDING.equals(row.getSendStatus()))
                .map(MeetingMinutesDelivery::getId)
                .filter(Objects::nonNull)
                .toList();
    }

    @Async
    public void dispatch(Long deliveryId) {
        send(deliveryId);
    }

    /**
     * 执行一条投递任务。
     *
     * <p>抢不到任务时静默返回（说明另一路已在处理或已终态）；本方法返回不代表投递完成，
     * 状态由渠道回调写。
     */
    public void send(Long deliveryId) {
        if (deliveryId == null || deliveryMapper.claim(deliveryId) == 0) {
            return;
        }
        MeetingMinutesDelivery row = deliveryMapper.selectById(deliveryId);
        if (row == null) {
            log.warn("紀要投遞任務已消失但狀態為投遞中: id={}", deliveryId);
            return;
        }
        int attempts = row.getRetryCount() == null ? 1 : row.getRetryCount() + 1;
        MeetingMinutesSend batch = sendMapper.selectById(row.getSendId());
        if (batch == null || !StringUtils.hasText(batch.getMarkdownSnapshot())) {
            finishFailure(row, attempts, "批次內容不存在", true);
            return;
        }
        if (MeetingConstants.MINUTES_TARGET_GROUP.equals(row.getTargetType())) {
            sendToGroup(row, batch, attempts);
        } else {
            sendToUser(row, batch, attempts);
        }
    }

    private void sendToGroup(MeetingMinutesDelivery row, MeetingMinutesSend batch, int attempts) {
        if (row.getGroupChannelId() == null) {
            finishFailure(row, attempts, REASON_CHANNEL_UNUSABLE, true);
            return;
        }
        try {
            SendOutcome outcome = dingTalkService.sendMarkdownSyncToChannel(row.getGroupChannelId(),
                    batch.getTitle(), batch.getMarkdownSnapshot(), List.of(), false);
            if (outcome != null && outcome.channelAccepted()) {
                complete(row.getId(), true, null);
                return;
            }
            // 渠道不存在/停用/非钉钉都是"重试也没用"的配置性失败，直接标 skipped 不再退避
            if (outcome != null && outcome.errmsg() != null && outcome.errmsg().startsWith("channel_")) {
                complete(row.getId(), false, REASON_CHANNEL_UNUSABLE);
                return;
            }
            finishFailure(row, attempts, outcome == null ? "渠道未受理"
                    : "errcode=" + outcome.errcode(), false);
        } catch (RuntimeException e) {
            finishFailure(row, attempts, e.getClass().getSimpleName(), false);
        }
    }

    private void sendToUser(MeetingMinutesDelivery row, MeetingMinutesSend batch, int attempts) {
        if (!StringUtils.hasText(row.getReceiverDingtalkId())) {
            complete(row.getId(), false, REASON_NOT_BOUND);
            return;
        }
        NotificationAppService.Credentials app = appService.resolve(MeetingConstants.SCENARIO_MINUTES);
        if (app == null) {
            // 排队期间场景被停用或改绑：不发送，也不回退到任何默认应用
            complete(row.getId(), false, REASON_SCENARIO_OFF);
            return;
        }
        try {
            dingTalkAppService.sendWorkNotification(MeetingConstants.SCENARIO_MINUTES, app.getId(),
                            List.of(row.getReceiverDingtalkId().trim()), batch.getTitle(), batch.getMarkdownSnapshot())
                    .whenComplete((accepted, error) -> {
                        if (Boolean.TRUE.equals(accepted)) {
                            complete(row.getId(), true, null);
                        } else {
                            finishFailure(row, attempts, error != null
                                    ? error.getClass().getSimpleName() : "渠道未受理", false);
                        }
                    });
        } catch (RuntimeException e) {
            // 提交动作本身异常（线程池拒绝等）：按失败退避，不能让任务永久停在投遞中
            finishFailure(row, attempts, e.getClass().getSimpleName(), false);
        }
    }

    /** 终态/退避写库 + 批次结论刷新：两条更新必须挨着做，否则批次会长期停在「发送中」 */
    private void complete(Long deliveryId, boolean success, String reason) {
        MeetingMinutesDelivery row = deliveryMapper.selectById(deliveryId);
        if (row == null) {
            return;
        }
        if (success) {
            deliveryMapper.markSuccess(deliveryId);
        } else {
            deliveryMapper.markSkipped(deliveryId, truncate(reason));
        }
        sendMapper.refreshOutcome(row.getSendId());
    }

    private void finishFailure(MeetingMinutesDelivery row, int attempts, String message, boolean terminal) {
        Long deliveryId = row.getId();
        if (deliveryId == null) {
            return;
        }
        String detail = truncate(message);
        if (terminal || attempts >= MAX_ATTEMPTS) {
            deliveryMapper.markFailed(deliveryId, truncate("重試耗盡：" + message), null);
        } else {
            int waitMinutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
            deliveryMapper.markFailed(deliveryId, detail, LocalDateTime.now().plusMinutes(waitMinutes));
        }
        sendMapper.refreshOutcome(row.getSendId());
        if (attempts >= MAX_ATTEMPTS) {
            log.error("紀要投遞重試耗盡，需人工補發: id={}, attempts={}", deliveryId, attempts);
        } else {
            log.warn("紀要投遞未受理: id={}, attempts={}, reason={}", deliveryId, attempts, detail);
        }
    }

    /** 每批领取的到期任务数（与邀约补发同一节奏） */
    public List<Long> dueIds(int limit) {
        return deliveryMapper.findDueIds(limit, MAX_ATTEMPTS);
    }

    /** 回收卡在投递中的任务（执行者重启遗留） */
    public int recoverStuck(int stuckMinutes) {
        return deliveryMapper.recoverStuck(stuckMinutes);
    }

    /** 群候选：只回启用中的钉钉渠道，前端拿不到 webhook */
    public List<SysNotificationChannel> usableChannels() {
        return channelMapper.selectList(new LambdaQueryWrapper<SysNotificationChannel>()
                .eq(SysNotificationChannel::getChannel, "dingtalk")
                .eq(SysNotificationChannel::getEnabled, 1)
                .orderByDesc(SysNotificationChannel::getIsDefault)
                .orderByDesc(SysNotificationChannel::getUpdatedAt));
    }

    /** 服务端复核渠道可用：前端传的 channelId 一律不直接相信 */
    public SysNotificationChannel usableChannel(Long channelId) {
        if (channelId == null || channelId <= 0) {
            return null;
        }
        SysNotificationChannel channel = channelMapper.selectById(channelId);
        if (channel == null || !"dingtalk".equals(channel.getChannel())
                || !Integer.valueOf(1).equals(channel.getEnabled())
                || !StringUtils.hasText(channel.getWebhookUrl())) {
            return null;
        }
        return channel;
    }

    private MeetingMinutesDelivery findRow(long sendId, String targetType, long receiverUserId) {
        return deliveryMapper.selectOne(new LambdaQueryWrapper<MeetingMinutesDelivery>()
                .eq(MeetingMinutesDelivery::getSendId, sendId)
                .eq(MeetingMinutesDelivery::getTargetType, targetType)
                .eq(MeetingMinutesDelivery::getReceiverUserId, receiverUserId)
                .last("LIMIT 1"));
    }

    private static String displayName(SysUser user) {
        return StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername();
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() > ERROR_MAX_LENGTH ? value.substring(0, ERROR_MAX_LENGTH) : value;
    }
}

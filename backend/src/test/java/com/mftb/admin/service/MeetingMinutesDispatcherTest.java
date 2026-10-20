package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesDelivery;
import com.mftb.admin.entity.MeetingMinutesSend;
import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesDeliveryMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.MeetingMinutesSendMapper;
import com.mftb.admin.mapper.SysNotificationChannelMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkService.SendOutcome;
import com.mftb.admin.util.JsonUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 纪要投递器的登记与结果回写口径。
 *
 * <p>钉住四类"发不出去也必须有因可查"的事实：场景未启用、收件人未绑定钉钉、群渠道不可用、
 * dry-run 开关开着。会议邀约那次真实冒烟暴露过"投递成功但页面看不出来"的问题，
 * 纪要是同一形状的风险：一次发送跨两个渠道，任何一路被静默跳过都会让人以为"发了"。
 *
 * <p>另外钉住两件事：群行<b>不计进个人 queued</b>（否则提示会说"已提交 2 条"而实际只发给 1 人），
 * 以及配置性失败（渠道停用/不存在）走 skipped 终态而不是退避重试——重试一个不存在的渠道永远不会成功。
 */
class MeetingMinutesDispatcherTest {

    private static final long SEND_ID = 77L;
    private static final long MINUTES_ID = 5L;
    private static final long BOOKING_ID = 100L;

    private MeetingMinutesMapper minutesMapper;
    private MeetingMinutesSendMapper sendMapper;
    private MeetingMinutesDeliveryMapper deliveryMapper;
    private SysUserMapper userMapper;
    private SysNotificationChannelMapper channelMapper;
    private NotificationAppService appService;
    private DingTalkAppService dingTalkAppService;
    private DingTalkService dingTalkService;
    private MeetingMinutesDispatcher dispatcher;

    private static NotificationAppService.Credentials app(long id) {
        return new NotificationAppService.Credentials(id, "app-key", "app-secret", "123", "https://admin.test", true);
    }

    private static MeetingMinutes minutes() {
        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setId(MINUTES_ID);
        minutes.setMinutesNo("MJ202610190001");
        minutes.setBookingId(BOOKING_ID);
        minutes.setBookingNo("MT202610190001");
        minutes.setMeetingTitle("Q4 預算復核");
        minutes.setContentJson(JsonUtils.toJson(new MeetingMinutesContent()));
        return minutes;
    }

    private static MeetingMinutesSend batch(Long channelId, String channelName) {
        MeetingMinutesSend send = new MeetingMinutesSend();
        send.setId(SEND_ID);
        send.setMinutesId(MINUTES_ID);
        send.setBookingId(BOOKING_ID);
        send.setBatchSeq(1);
        send.setTitle("【會議紀要】Q4 預算復核");
        send.setContentSnapshot(JsonUtils.toJson(new MeetingMinutesContent()));
        send.setMarkdownSnapshot("**正文**");
        send.setGroupChannelId(channelId);
        send.setGroupChannelName(channelName);
        send.setSendStatus(MeetingConstants.NOTIFY_PENDING);
        return send;
    }

    private static SysUser user(long id, String empId, String name, String dingtalkId) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setEmpId(empId);
        user.setName(name);
        user.setUsername(name);
        user.setDepartment("財務部");
        user.setDingtalkUserId(dingtalkId);
        return user;
    }

    private static MeetingMinutesDelivery row(String targetType, long receiverUserId, String dingtalkId, Long channelId) {
        MeetingMinutesDelivery row = new MeetingMinutesDelivery();
        row.setId(900L);
        row.setSendId(SEND_ID);
        row.setMinutesId(MINUTES_ID);
        row.setBookingId(BOOKING_ID);
        row.setTargetType(targetType);
        row.setReceiverUserId(receiverUserId);
        row.setReceiverDingtalkId(dingtalkId);
        row.setGroupChannelId(channelId);
        row.setScenario(MeetingConstants.SCENARIO_MINUTES);
        row.setSendStatus(MeetingConstants.NOTIFY_PENDING);
        row.setRetryCount(0);
        return row;
    }

    @BeforeEach
    void setUp() {
        minutesMapper = mock(MeetingMinutesMapper.class);
        sendMapper = mock(MeetingMinutesSendMapper.class);
        deliveryMapper = mock(MeetingMinutesDeliveryMapper.class);
        userMapper = mock(SysUserMapper.class);
        channelMapper = mock(SysNotificationChannelMapper.class);
        appService = mock(NotificationAppService.class);
        dingTalkAppService = mock(DingTalkAppService.class);
        dingTalkService = mock(DingTalkService.class);
        // v1.1：推送开关默认全开（mock 没有配置行时按开处理，这里显式给出同一口径）
        MeetingNotifyTemplateService templateService = mock(MeetingNotifyTemplateService.class);
        when(templateService.enabled(anyString(), anyString())).thenReturn(true);
        dispatcher = new MeetingMinutesDispatcher(minutesMapper, sendMapper, deliveryMapper, userMapper,
                channelMapper, appService, dingTalkAppService, dingTalkService, templateService);
        ReflectionTestUtils.setField(dispatcher, "dryRun", false);
        // 未提交事务时 scheduleAfterCommit 会立即扫待投明细；这里给它空列表，只测登记本身
        when(deliveryMapper.findBySend(SEND_ID)).thenReturn(List.of());
    }

    /* ==================== 登记 ==================== */

    @Test
    @DisplayName("工作通知场景未启用：每个收件人都留一行 skipped 并写明原因，不是静默不发")
    void scenarioOffMarksEveryReceiverSkipped() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(null);
        when(userMapper.selectList(any())).thenReturn(List.of(user(7L, "MF00007", "張三", "dt-7")));
        // INSERT IGNORE 对不存在的行回 1；不桩上就是默认 0（等于“被规重挡住”），会测出另一个分支
        when(deliveryMapper.insertUserIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), any(), any())).thenReturn(1);

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(minutes(), batch(null, ""), List.of(7L));

        assertFalse(result.isScenarioActive());
        assertEquals(0, result.getQueued());
        assertEquals(1, result.getSkipped());
        SkippedAndQueued row = capturedUserRows().get(0);
        assertEquals(MeetingConstants.NOTIFY_SKIPPED, row.sendStatus);
        assertTrue(row.errorMsg.contains("場景未啟用"), row.errorMsg);
    }

    @Test
    @DisplayName("场景已启用：绑定钉钉的人进队列，未绑定的留 skipped；queued 只算个人")
    void boundReceiverQueuedUnboundSkipped() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(userMapper.selectList(any())).thenReturn(List.of(
                user(7L, "MF00007", "張三", "dt-7"),
                user(8L, "MF00008", "李四", null)));
        when(deliveryMapper.insertUserIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), any(), any()))
                .thenReturn(1);

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(
                minutes(), batch(null, ""), List.of(7L, 8L));

        assertEquals(1, result.getQueued(), "只有绑定钉钉的那位进队列");
        assertEquals(1, result.getSkipped());
        assertFalse(result.isGroupQueued(), "本批没选群");
        // 参数达 12 个，用位置匹配会因一多一少整个错位；改成捕获后逐字段断言
        List<SkippedAndQueued> rows = capturedUserRows();
        assertEquals(2, rows.size());
        SkippedAndQueued bound = rows.stream().filter(item -> item.receiverUserId == 7L).findFirst().orElseThrow();
        assertEquals(MeetingConstants.NOTIFY_PENDING, bound.sendStatus);
        assertEquals("dt-7", bound.dingtalkId);
        assertNull(bound.errorMsg);
        assertNotNull(bound.nextRetryAt, "pending 行要带立即可投时，否则重试作业扫不到");
        SkippedAndQueued unbound = rows.stream().filter(item -> item.receiverUserId == 8L).findFirst().orElseThrow();
        assertEquals(MeetingConstants.NOTIFY_SKIPPED, unbound.sendStatus);
        assertEquals("", unbound.dingtalkId);
        assertTrue(unbound.errorMsg.contains("未綁定釘釘"), unbound.errorMsg);
    }

    @Test
    @DisplayName("群投递不计进个人 queued：否则提示会写「已提交 2 条」而实际只发给 1 人")
    void groupRowIsNotCountedIntoPersonalQueue() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(userMapper.selectList(any())).thenReturn(List.of(user(7L, "MF00007", "張三", "dt-7")));
        SysNotificationChannel channel = new SysNotificationChannel();
        channel.setId(88L);
        channel.setChannel("dingtalk");
        channel.setEnabled(1);
        channel.setWebhookUrl("https://oapi.dingtalk.com/robot/send?access_token=x");
        when(channelMapper.selectById(88L)).thenReturn(channel);
        when(deliveryMapper.insertGroupIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(),
                anyString(), any(), any())).thenReturn(1);
        when(deliveryMapper.insertUserIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), any(), any())).thenReturn(1);

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(
                minutes(), batch(88L, "行政通知群"), List.of(7L));

        assertTrue(result.isGroupQueued());
        assertEquals(1, result.getQueued(), "queued 只算个人工作通知");
        assertEquals(0, result.getSkipped());
        verify(deliveryMapper).insertGroupIgnore(eq(SEND_ID), eq(MINUTES_ID), eq(BOOKING_ID), eq(88L),
                eq("行政通知群"), eq(MeetingConstants.NOTIFY_PENDING), any(LocalDateTime.class), isNull());
    }

    @Test
    @DisplayName("群渠道不存在或被停用时标 skipped 并写明原因，而不是发进默认群")
    void unusableChannelIsSkippedNotDefaulted() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(channelMapper.selectById(88L)).thenReturn(null);
        when(deliveryMapper.insertGroupIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(),
                anyString(), any(), any())).thenReturn(1);

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(
                minutes(), batch(88L, "行政通知群"), List.of());

        assertFalse(result.isGroupQueued());
        assertEquals(1, result.getSkipped());
        ArgumentCaptor<String> status = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> reason = ArgumentCaptor.forClass(String.class);
        verify(deliveryMapper).insertGroupIgnore(eq(SEND_ID), eq(MINUTES_ID), eq(BOOKING_ID), eq(88L),
                eq("行政通知群"), status.capture(), isNull(), reason.capture());
        assertEquals(MeetingConstants.NOTIFY_SKIPPED, status.getValue());
        assertTrue(reason.getValue().contains("釘釘群渠道不存在"), reason.getValue());
    }

    @Test
    @DisplayName("dry-run 联调开关：照常登记留痕但一条都不真发")
    void dryRunRegistersButSendsNothing() {
        ReflectionTestUtils.setField(dispatcher, "dryRun", true);
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(userMapper.selectList(any())).thenReturn(List.of(user(7L, "MF00007", "張三", "dt-7")));
        when(deliveryMapper.insertUserIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), any(), any())).thenReturn(1);

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(
                minutes(), batch(null, ""), List.of(7L));

        assertEquals(0, result.getQueued());
        assertEquals(1, result.getSkipped());
        SkippedAndQueued row = capturedUserRows().get(0);
        assertEquals(MeetingConstants.NOTIFY_SKIPPED, row.sendStatus);
        assertNull(row.nextRetryAt, "dry-run 不能给重试时间，否则下一轮会真的发出去");
        assertTrue(row.errorMsg.contains("dry-run"), row.errorMsg);
    }

    @Test
    @DisplayName("名单里查不到的人也要算进 skipped：少发一个人必须在数据里看得见")
    void missingUserIsCountedAsSkipped() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(userMapper.selectList(any())).thenReturn(List.of());

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(
                minutes(), batch(null, ""), List.of(999L));

        assertEquals(1, result.getSkipped());
    }

    @Test
    @DisplayName("同一批次同一人重复登记被唯一键挡下，不重复计数也不重复发")
    void duplicateDeliveryRowIsIgnored() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(userMapper.selectList(any())).thenReturn(List.of(user(7L, "MF00007", "張三", "dt-7")));
        when(deliveryMapper.insertUserIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), any(), any())).thenReturn(0);

        MeetingMinutesDispatcher.RegisterResult result = dispatcher.register(
                minutes(), batch(null, ""), List.of(7L));

        assertEquals(0, result.getQueued());
        assertEquals(0, result.getSkipped());
    }

    /** 捕获全部收件人登记行（参数多到位置匹配易错，用捕获后逐字段断言） */
    private List<SkippedAndQueued> capturedUserRows() {
        ArgumentCaptor<Long> sendId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> minutesId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> bookingId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> receiverId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<String> name = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> empNo = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> department = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> dingtalkId = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> scenario = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> status = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<LocalDateTime> nextRetry = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<String> errorMsg = ArgumentCaptor.forClass(String.class);
        verify(deliveryMapper, org.mockito.Mockito.atLeastOnce()).insertUserIgnore(sendId.capture(),
                minutesId.capture(), bookingId.capture(), receiverId.capture(), name.capture(), empNo.capture(),
                department.capture(), dingtalkId.capture(), scenario.capture(), status.capture(),
                nextRetry.capture(), errorMsg.capture());
        List<SkippedAndQueued> rows = new java.util.ArrayList<>();
        for (int index = 0; index < receiverId.getAllValues().size(); index++) {
            assertEquals(SEND_ID, sendId.getAllValues().get(index));
            assertEquals(MINUTES_ID, minutesId.getAllValues().get(index));
            rows.add(new SkippedAndQueued(receiverId.getAllValues().get(index),
                    dingtalkId.getAllValues().get(index), status.getAllValues().get(index),
                    nextRetry.getAllValues().get(index), errorMsg.getAllValues().get(index)));
        }
        return rows;
    }

    private record SkippedAndQueued(long receiverUserId, String dingtalkId, String sendStatus,
                                    LocalDateTime nextRetryAt, String errorMsg) {
    }

    @Test
    @DisplayName("全被跳过时也要马上回算批次结论：否则发送历史永远停在「發送中」且计数全为 0")
    void registerAlwaysRecomputesBatchOutcome() {
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(null);
        when(userMapper.selectList(any())).thenReturn(List.of(user(7L, "MF00007", "張三", null)));
        when(deliveryMapper.insertUserIgnore(anyLong(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), any(), any())).thenReturn(1);

        dispatcher.register(minutes(), batch(null, ""), List.of(7L));

        // skipped 行不进投递队列，也就永远不会有回调来算这件事，登记后必须自己算一次
        verify(sendMapper).refreshOutcome(SEND_ID);
    }

    /* ==================== 结果回写 ==================== */

    @Test
    @DisplayName("抢不到任务就什么都不做：多实例下同一行只会被投一次")
    void claimFailureSendsNothing() {
        when(deliveryMapper.claim(900L)).thenReturn(0);

        dispatcher.send(900L);

        verify(deliveryMapper, never()).selectById(anyLong());
        verify(dingTalkService, never()).sendMarkdownSyncToChannel(anyLong(), anyString(), anyString(), any(), eq(false));
    }

    @Test
    @DisplayName("群渠道受理：明细标 success 并回算批次结论")
    void groupAcceptedMarksSuccess() {
        MeetingMinutesDelivery row = row(MeetingConstants.MINUTES_TARGET_GROUP, 0L, null, 88L);
        when(deliveryMapper.claim(900L)).thenReturn(1);
        when(deliveryMapper.selectById(900L)).thenReturn(row);
        when(sendMapper.selectById(SEND_ID)).thenReturn(batch(88L, "行政通知群"));
        when(dingTalkService.sendMarkdownSyncToChannel(eq(88L), anyString(), anyString(), any(), eq(false)))
                .thenReturn(SendOutcome.accepted("行政通知群"));

        dispatcher.send(900L);

        verify(deliveryMapper).markSuccess(900L);
        verify(sendMapper).refreshOutcome(SEND_ID);
    }

    @Test
    @DisplayName("渠道不存在/停用属配置性失败：标 skipped 终态，不占用重试次数")
    void groupChannelMissingIsTerminalSkip() {
        MeetingMinutesDelivery row = row(MeetingConstants.MINUTES_TARGET_GROUP, 0L, null, 88L);
        when(deliveryMapper.claim(900L)).thenReturn(1);
        when(deliveryMapper.selectById(900L)).thenReturn(row);
        when(sendMapper.selectById(SEND_ID)).thenReturn(batch(88L, "行政通知群"));
        when(dingTalkService.sendMarkdownSyncToChannel(eq(88L), anyString(), anyString(), any(), eq(false)))
                .thenReturn(SendOutcome.unknown("channel_disabled"));

        dispatcher.send(900L);

        verify(deliveryMapper).markSkipped(eq(900L), contains("釘釘群渠道不存在"));
        verify(deliveryMapper, never()).markFailed(anyLong(), anyString(), any());
    }

    @Test
    @DisplayName("钉钉返回非零错误码：标 failed 并给出下次重试时间，等下一轮补发")
    void groupRejectedSchedulesRetry() {
        MeetingMinutesDelivery row = row(MeetingConstants.MINUTES_TARGET_GROUP, 0L, null, 88L);
        when(deliveryMapper.claim(900L)).thenReturn(1);
        when(deliveryMapper.selectById(900L)).thenReturn(row);
        when(sendMapper.selectById(SEND_ID)).thenReturn(batch(88L, "行政通知群"));
        when(dingTalkService.sendMarkdownSyncToChannel(eq(88L), anyString(), anyString(), any(), eq(false)))
                .thenReturn(SendOutcome.rejected("130101", "sender not exist", "行政通知群"));

        dispatcher.send(900L);

        verify(deliveryMapper).markFailed(eq(900L), contains("130101"), any(LocalDateTime.class));
        verify(sendMapper).refreshOutcome(SEND_ID);
    }

    @Test
    @DisplayName("排队期间场景被停用：个人行标 skipped，不回退到任何默认企业应用")
    void userSkippedWhenScenarioTurnedOffLater() {
        MeetingMinutesDelivery row = row(MeetingConstants.MINUTES_TARGET_USER, 7L, "dt-7", null);
        when(deliveryMapper.claim(900L)).thenReturn(1);
        when(deliveryMapper.selectById(900L)).thenReturn(row);
        when(sendMapper.selectById(SEND_ID)).thenReturn(batch(null, ""));
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(null);

        dispatcher.send(900L);

        verify(deliveryMapper).markSkipped(eq(900L), contains("場景未啟用"));
        verify(dingTalkAppService, never()).sendWorkNotification(anyString(), anyLong(), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("工作通知受理即 success，未受理按失败退避（不是调用返回就算送达）")
    void userOutcomeFollowsChannelCallback() {
        MeetingMinutesDelivery row = row(MeetingConstants.MINUTES_TARGET_USER, 7L, "dt-7", null);
        when(deliveryMapper.claim(900L)).thenReturn(1);
        when(deliveryMapper.selectById(900L)).thenReturn(row);
        when(sendMapper.selectById(SEND_ID)).thenReturn(batch(null, ""));
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(dingTalkAppService.sendWorkNotification(eq(MeetingConstants.SCENARIO_MINUTES), eq(1L), any(),
                anyString(), anyString())).thenReturn(CompletableFuture.completedFuture(Boolean.FALSE));

        dispatcher.send(900L);

        verify(deliveryMapper).markFailed(eq(900L), anyString(), any(LocalDateTime.class));
        verify(deliveryMapper, never()).markSuccess(900L);
        verify(sendMapper).refreshOutcome(SEND_ID);
    }

    @Test
    @DisplayName("批次正文缺失时直接判失败终态，不发出空卡片")
    void missingSnapshotIsTerminalFailure() {
        MeetingMinutesDelivery row = row(MeetingConstants.MINUTES_TARGET_USER, 7L, "dt-7", null);
        when(deliveryMapper.claim(900L)).thenReturn(1);
        when(deliveryMapper.selectById(900L)).thenReturn(row);
        MeetingMinutesSend empty = batch(null, "");
        empty.setMarkdownSnapshot(null);
        when(sendMapper.selectById(SEND_ID)).thenReturn(empty);

        dispatcher.send(900L);

        verify(deliveryMapper).markFailed(eq(900L), contains("批次內容不存在"), isNull());
        verify(dingTalkAppService, never()).sendWorkNotification(anyString(), anyLong(), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("可用渠道候选只回启用中的钉钉渠道，且带 webhook 的才算可用")
    void channelUsabilityCheckIsStrict() {
        SysNotificationChannel disabled = new SysNotificationChannel();
        disabled.setId(1L);
        disabled.setChannel("dingtalk");
        disabled.setEnabled(0);
        when(channelMapper.selectById(1L)).thenReturn(disabled);
        assertNull(dispatcher.usableChannel(1L));

        SysNotificationChannel feishu = new SysNotificationChannel();
        feishu.setId(2L);
        feishu.setChannel("feishu");
        feishu.setEnabled(1);
        when(channelMapper.selectById(2L)).thenReturn(feishu);
        assertNull(dispatcher.usableChannel(2L));

        assertNull(dispatcher.usableChannel(null));
    }
}

package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingNotifyLog;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingNotifyLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingNotifyTemplateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 投递结果必须同时落在两张表上：{@code biz_meeting_notify_log} 是可对账的留痕，
 * {@code biz_meeting_attendee.notify_status} 是详情页参会人名单读的那一列。
 *
 * <p>钉住的现象（2026-10-17 真实冒烟暴露）：钉钉已受理、留痕行是 success，
 * 但参会人行永远停在 pending，详情页因此并排展示「待發送」与「已送達」两套相互否定的事实。
 *
 * <p>同时钉住词表翻译：参会人列的 DDL CHECK 只接受 pending/sent/skipped/failed，
 * 回写时必须把 log 表的 success 翻成 sent，写成 success 会撞约束。
 */
class MeetingNotifyDispatcherOutcomeTest {

    private MeetingNotifyLogMapper notifyMapper;
    private MeetingAttendeeMapper attendeeMapper;
    private MeetingBookingMapper bookingMapper;
    private NotificationAppService appService;
    private DingTalkAppService dingTalkAppService;
    private MeetingPublicViewService publicViewService;
    private MeetingNotifyDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        notifyMapper = mock(MeetingNotifyLogMapper.class);
        attendeeMapper = mock(MeetingAttendeeMapper.class);
        bookingMapper = mock(MeetingBookingMapper.class);
        appService = mock(NotificationAppService.class);
        dingTalkAppService = mock(DingTalkAppService.class);
        publicViewService = mock(MeetingPublicViewService.class);
        dispatcher = new MeetingNotifyDispatcher(notifyMapper, attendeeMapper, bookingMapper,
                mock(SysUserMapper.class), appService, dingTalkAppService,
                mock(MeetingNotifyTemplateService.class), publicViewService);
    }

    private MeetingNotifyLog task() {
        MeetingNotifyLog row = new MeetingNotifyLog();
        row.setId(45L);
        row.setBookingId(22L);
        row.setBookingNo("MT202610170021");
        row.setEventCode(MeetingConstants.NOTIFY_EVT_CREATED);
        row.setScenario(NotificationAppService.MEETING_INVITE);
        row.setReceiverUserId(2L);
        row.setReceiverName("冯松");
        row.setReceiverDingtalkId("dt-0002");
        row.setSendStatus(MeetingConstants.NOTIFY_PENDING);
        row.setRetryCount(0);
        return row;
    }

    @Test
    @DisplayName("渠道受理：留痕标 success，参会人行翻译成 sent 并清空旧原因")
    void acceptedMarksAttendeeSent() {
        dispatcher.applyOutcome(task(), 1, Boolean.TRUE, null);

        verify(notifyMapper).markSuccess(45L);
        verify(attendeeMapper).updateNotifyForUser(22L, 2L, MeetingConstants.NOTIFY_SENT, null);
    }

    @Test
    @DisplayName("首次未受理：按退避重试，参会人行同样标失败（回写不能只写终态）")
    void firstFailureBacksOffAndMarksAttendeeFailed() {
        dispatcher.applyOutcome(task(), 1, Boolean.FALSE, new IllegalStateException("网关超时"));

        verify(notifyMapper).markFailed(eq(45L), anyString(), any(java.time.LocalDateTime.class));
        verify(attendeeMapper).updateNotifyForUser(eq(22L), eq(2L),
                eq(MeetingConstants.NOTIFY_FAILED), anyString());
    }

    @Test
    @DisplayName("重试耗尽：留痕不再给下次重试时间，参会人行的原因必须可读")
    void exhaustedRetriesStopScheduling() {
        dispatcher.applyOutcome(task(), MeetingNotifyDispatcher.MAX_ATTEMPTS, Boolean.FALSE, null);

        verify(notifyMapper).markFailed(eq(45L), anyString(), isNull());
        verify(attendeeMapper).updateNotifyForUser(eq(22L), eq(2L),
                eq(MeetingConstants.NOTIFY_FAILED), anyString());
    }

    @Test
    @DisplayName("未绑定钉钉的排队任务：标 skipped 并把原因写给参会人")
    void sendWithoutDingtalkIdSkipsAndNotesReason() {
        MeetingNotifyLog row = task();
        row.setReceiverDingtalkId("");
        when(notifyMapper.claim(45L)).thenReturn(1);
        when(notifyMapper.selectById(45L)).thenReturn(row);

        dispatcher.send(45L);

        verify(notifyMapper).markSkipped(45L, MeetingNotifyDispatcher.REASON_NOT_BOUND);
        verify(attendeeMapper).updateNotifyForUser(22L, 2L, MeetingConstants.NOTIFY_SKIPPED,
                MeetingNotifyDispatcher.REASON_NOT_BOUND);
        verify(dingTalkAppService, never()).sendWorkNotification(anyString(), anyLong(), anyList(),
                anyString(), anyString());
    }

    @Test
    @DisplayName("排队期间场景被停用：不发送、不回退默认应用，并把原因写给参会人")
    void sendStopsWhenScenarioTurnedOff() {
        MeetingNotifyLog row = task();
        when(notifyMapper.claim(45L)).thenReturn(1);
        when(notifyMapper.selectById(45L)).thenReturn(row);
        when(appService.resolve(row.getScenario())).thenReturn(null);

        dispatcher.send(45L);

        verify(notifyMapper).markSkipped(45L, MeetingNotifyDispatcher.REASON_SCENARIO_OFF);
        verify(attendeeMapper).updateNotifyForUser(22L, 2L, MeetingConstants.NOTIFY_SKIPPED,
                MeetingNotifyDispatcher.REASON_SCENARIO_OFF);
    }

    @Test
    @DisplayName("真实受理链路：渠道回调 accepted 后两张表都前进")
    void dispatchedTaskUpdatesBothTables() {
        MeetingNotifyLog row = task();
        when(notifyMapper.claim(45L)).thenReturn(1);
        when(notifyMapper.selectById(45L)).thenReturn(row);
        when(appService.resolve(row.getScenario()))
                .thenReturn(new NotificationAppService.Credentials(1L, "key", "secret", "4988071335",
                        "http://192.168.31.88:3000", true));
        MeetingBooking booking = new MeetingBooking();
        booking.setId(22L);
        booking.setBookingNo(row.getBookingNo());
        booking.setTitle("QA冒烟-釘釘邀約真實投遞");
        booking.setRoomName("會議室 A");
        booking.setStartTime(java.time.LocalDateTime.now().plusDays(1));
        booking.setEndTime(booking.getStartTime().plusMinutes(30));
        booking.setOrganizerName("管理员");
        when(bookingMapper.selectById(22L)).thenReturn(booking);
        when(dingTalkAppService.sendWorkNotification(anyString(), anyLong(), anyList(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(Boolean.TRUE));

        dispatcher.send(45L);

        verify(notifyMapper).markSuccess(45L);
        verify(attendeeMapper).updateNotifyForUser(22L, 2L, MeetingConstants.NOTIFY_SENT, null);
    }

    @Test
    @DisplayName("外部参会人（无系统账号）没有 user id：只动留痕行，不回写参会人")
    void missingReceiverUserIdSkipsWriteBack() {
        MeetingNotifyLog row = task();
        row.setReceiverUserId(null);

        dispatcher.applyOutcome(row, 1, Boolean.TRUE, null);

        verify(notifyMapper).markSuccess(45L);
        verify(attendeeMapper, never()).updateNotifyForUser(anyLong(), anyLong(), anyString(), any());
    }

    @Test
    @DisplayName("回写参会人行失败不能吞掉留痕结果：明细页仍要能对账")
    void writeBackFailureKeepsLogOutcome() {
        when(attendeeMapper.updateNotifyForUser(anyLong(), anyLong(), anyString(), isNull()))
                .thenThrow(new IllegalStateException("約束衝突"));

        dispatcher.applyOutcome(task(), 1, Boolean.TRUE, null);

        verify(notifyMapper).markSuccess(45L);
    }

    @Test
    @DisplayName("进行中的会：投递走 action_card，不再发纯 markdown")
    void sendOpenMeetingUsesActionCard() {
        MeetingNotifyLog row = task();
        when(notifyMapper.claim(45L)).thenReturn(1);
        when(notifyMapper.selectById(45L)).thenReturn(row);
        when(appService.resolve(row.getScenario()))
                .thenReturn(new NotificationAppService.Credentials(1L, "key", "secret", "4988071335",
                        "https://portal.example.com", true));
        MeetingBooking booking = new MeetingBooking();
        booking.setId(22L);
        booking.setBookingNo(row.getBookingNo());
        booking.setTitle("产品周会");
        booking.setRoomName("产品会议室");
        booking.setOrganizerName("系統管理員");
        booking.setStatus(MeetingConstants.STATUS_BOOKED);
        booking.setStartTime(java.time.LocalDateTime.now().plusDays(1));
        booking.setEndTime(booking.getStartTime().plusHours(1));
        when(bookingMapper.selectById(22L)).thenReturn(booking);
        when(publicViewService.detailUrl(anyString(), any(MeetingBooking.class)))
                .thenReturn("https://portal.example.com/#/meeting-view?token=abc");
        when(dingTalkAppService.sendWorkActionCard(anyString(), anyLong(), anyList(), anyString(),
                anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(Boolean.TRUE));

        dispatcher.send(45L);

        verify(dingTalkAppService).sendWorkActionCard(eq(row.getScenario()), eq(1L), anyList(),
                eq("产品周会"), anyString(), eq("查看會議詳情"),
                eq("https://portal.example.com/#/meeting-view?token=abc"));
        verify(dingTalkAppService, never()).sendWorkNotification(anyString(), anyLong(), anyList(),
                anyString(), anyString());
    }

    @Test
    @DisplayName("进行中的会：走 action_card，标题是会议名称，详情按钮指向免登链接")
    void openMeetingUsesActionCardWithPublicLink() {
        MeetingBooking booking = new MeetingBooking();
        booking.setId(22L);
        booking.setBookingNo("MT202610260001");
        booking.setTitle("产品周会");
        booking.setRoomName("产品会议室");
        booking.setRoomLocation("珠海·A栋·21F");
        booking.setOrganizerName("系統管理員");
        booking.setStatus(MeetingConstants.STATUS_BOOKED);
        booking.setStartTime(java.time.LocalDateTime.now().plusDays(1));
        booking.setEndTime(booking.getStartTime().plusHours(1));
        when(publicViewService.detailUrl(anyString(), any(MeetingBooking.class)))
                .thenReturn("https://portal.example.com/#/meeting-view?token=abc");

        MeetingNotifyDispatcher.MeetingCard card =
                dispatcher.buildCard(booking, MeetingConstants.NOTIFY_EVT_CREATED, "https://portal.example.com");

        org.junit.jupiter.api.Assertions.assertEquals("产品周会", card.title());
        org.junit.jupiter.api.Assertions.assertTrue(card.body().contains("會議時間：**"),
                "会议时间必须单独成段");
        org.junit.jupiter.api.Assertions.assertFalse(card.body().contains("會議單號"),
                "会议单号不再进卡片，避免挤占重点");
        org.junit.jupiter.api.Assertions.assertEquals("查看會議詳情", card.buttonTitle());
        org.junit.jupiter.api.Assertions.assertEquals("https://portal.example.com/#/meeting-view?token=abc",
                card.buttonUrl());
    }

    @Test
    @DisplayName("已取消的会：不挂按钮，正文说明已取消并带原因")
    void cancelledMeetingHasNoButtonAndNoLink() {
        MeetingBooking booking = new MeetingBooking();
        booking.setId(22L);
        booking.setTitle("产品周会");
        booking.setRoomName("产品会议室");
        booking.setOrganizerName("系統管理員");
        booking.setStatus(MeetingConstants.STATUS_CANCELLED);
        booking.setCancelReason("临时改期");
        booking.setStartTime(java.time.LocalDateTime.now().plusDays(1));
        booking.setEndTime(booking.getStartTime().plusHours(1));

        MeetingNotifyDispatcher.MeetingCard card =
                dispatcher.buildCard(booking, MeetingConstants.NOTIFY_EVT_CANCELLED, "https://portal.example.com");

        org.junit.jupiter.api.Assertions.assertNull(card.buttonUrl(), "终态会议不得再给跳转入口");
        org.junit.jupiter.api.Assertions.assertTrue(card.body().contains("本場會議已取消"), card.body());
        org.junit.jupiter.api.Assertions.assertTrue(card.body().contains("臨时改期") || card.body().contains("临时改期"),
                card.body());
        org.junit.jupiter.api.Assertions.assertFalse(card.body().contains("會議室已被釋放"),
                "取消不能复用释放模板，否则两个事实互相否定");
        org.junit.jupiter.api.Assertions.assertFalse(card.body().contains("]("), "终态卡片不得留可点链接");
        verify(publicViewService, never()).detailUrl(anyString(), any(MeetingBooking.class));
    }

    @Test
    @DisplayName("已结束的会：同样不挂按钮，链接不生成")
    void endedMeetingHasNoButton() {
        MeetingBooking booking = new MeetingBooking();
        booking.setId(22L);
        booking.setTitle("产品周会");
        booking.setRoomName("产品会议室");
        booking.setOrganizerName("系統管理員");
        booking.setStatus(MeetingConstants.STATUS_BOOKED);
        booking.setStartTime(java.time.LocalDateTime.now().minusHours(2));
        booking.setEndTime(java.time.LocalDateTime.now().minusHours(1));

        MeetingNotifyDispatcher.MeetingCard card =
                dispatcher.buildCard(booking, MeetingConstants.NOTIFY_EVT_CREATED, "https://portal.example.com");

        org.junit.jupiter.api.Assertions.assertNull(card.buttonUrl());
        verify(publicViewService, never()).detailUrl(anyString(), any(MeetingBooking.class));
    }
}

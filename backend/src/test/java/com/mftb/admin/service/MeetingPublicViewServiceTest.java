package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.util.MeetingViewTokenUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 免登会议详情视图单测（不触库、不起 Spring）。
 *
 * <p>钉住公开页最容易被改坏的三处：
 *   1. 令牌无效/篡改/过期一律只给统一提示，不暴露会议事实；
 *   2. 终态（取消/释放/结束）closed=true，且线上会议地址不再下放；
 *   3. 响应只含会议公开字段（参会人名单、手机号、投递明细本就不在视图里）。
 */
class MeetingPublicViewServiceTest {

    private static final String SECRET = "meeting-view:test-secret";

    private MeetingBookingMapper bookingMapper;
    private SysConfigService sysConfigService;
    private MeetingPublicViewService service;

    @BeforeEach
    void setUp() {
        bookingMapper = mock(MeetingBookingMapper.class);
        sysConfigService = mock(SysConfigService.class);
        when(sysConfigService.getConfigValue(MeetingConstants.CFG_VIEW_TOKEN_SECRET)).thenReturn(SECRET);
        service = new MeetingPublicViewService(bookingMapper, sysConfigService);
    }

    private String token() {
        return MeetingViewTokenUtil.generate(22L, LocalDateTime.now().plusDays(1), SECRET);
    }

    private MeetingBooking booking(String status, LocalDateTime start) {
        MeetingBooking booking = new MeetingBooking();
        booking.setId(22L);
        booking.setBookingNo("MT202610260001");
        booking.setTitle("產品週會");
        booking.setRoomName("產品會議室");
        booking.setRoomLocation("珠海 · A棟 · 21F");
        booking.setOrganizerName("系統管理員");
        booking.setStatus(status);
        booking.setStartTime(start);
        booking.setEndTime(start.plusHours(1));
        booking.setOnlineMeetingUrl("https://meeting.example.com/abc");
        return booking;
    }

    @Test
    @DisplayName("进行中的会：closed=false，线上会议地址可下放")
    void openMeetingExposesOnlineUrl() {
        MeetingBooking booking = booking(MeetingConstants.STATUS_BOOKED, LocalDateTime.now().plusHours(1));
        when(bookingMapper.selectById(22L)).thenReturn(booking);

        MeetingBookingDto.PublicView view = service.view(token());

        assertTrue(view.getValid());
        assertFalse(view.getClosed());
        assertEquals("待開始", view.getStatusText());
        assertEquals("https://meeting.example.com/abc", view.getOnlineMeetingUrl());
        assertEquals("產品會議室", view.getRoomName());
    }

    @Test
    @DisplayName("已取消：closed=true，线上会议地址不再下放，取消原因单独给")
    void cancelledMeetingIsReadOnly() {
        MeetingBooking booking = booking(MeetingConstants.STATUS_CANCELLED, LocalDateTime.now().plusHours(1));
        booking.setCancelReason("臨時改期");
        when(bookingMapper.selectById(22L)).thenReturn(booking);

        MeetingBookingDto.PublicView view = service.view(token());

        assertTrue(view.getClosed());
        assertEquals("已取消", view.getStatusText());
        assertNull(view.getOnlineMeetingUrl(), "已取消的会再给线上入口只会把人引到空会议室");
        assertEquals("臨時改期", view.getCancelReason());
    }

    @Test
    @DisplayName("已过结束时间（占用单未收尾）：同样按已结束处理")
    void endedOccupyingMeetingIsClosed() {
        MeetingBooking booking = booking(MeetingConstants.STATUS_BOOKED, LocalDateTime.now().minusHours(2));
        when(bookingMapper.selectById(22L)).thenReturn(booking);

        MeetingBookingDto.PublicView view = service.view(token());

        assertTrue(view.getClosed());
        assertEquals("已結束", view.getStatusText());
        assertNull(view.getOnlineMeetingUrl());
    }

    @Test
    @DisplayName("令牌篡改/格式非法：统一失效提示，不查会议（不暴露单号是否存在）")
    void invalidTokensDoNotReachDatabase() {
        MeetingBookingDto.PublicView tampered = service.view("22.9999999999999.forged");
        assertFalse(tampered.getValid());
        assertTrue(tampered.getClosed());
        assertEquals("會議詳情連結無效或已過期，請從釘釘卡片重新進入", tampered.getMessage());
        assertFalse(service.view(null).getValid());

        verify(bookingMapper, never()).selectById(anyLong());
    }

    @Test
    @DisplayName("令牌有效但会议已删除：同样按失效处理")
    void missingBookingIsInvalid() {
        when(bookingMapper.selectById(22L)).thenReturn(null);

        MeetingBookingDto.PublicView view = service.view(token());

        assertFalse(view.getValid());
    }
}

package com.mftb.admin.config;

import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.service.MeetingRuleService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 存量冻结回归：升级前已存在、且 rule_snapshot 仍为 NULL 的占用单，
 * 必须按“升级时生效规则”补写快照，否则后续改规则会把已约好的会按新规则重判。
 */
class MeetingRuleSnapshotBackfillInitializerTest {

    @Test
    void freezesLegacyOccupyingBookingWithCurrentEffectiveRule() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        MeetingRuleService ruleService = mock(MeetingRuleService.class);
        MeetingBookingMapper bookingMapper = mock(MeetingBookingMapper.class);
        MeetingRoomMapper roomMapper = mock(MeetingRoomMapper.class);

        when(jdbc.queryForList(anyString(), eq(Long.class))).thenReturn(List.of(42L));
        MeetingBooking booking = new MeetingBooking();
        booking.setId(42L);
        booking.setRoomId(9L);
        booking.setStartTime(LocalDateTime.of(2026, 11, 2, 10, 0));
        when(bookingMapper.selectById(42L)).thenReturn(booking);
        MeetingRoom room = new MeetingRoom();
        room.setId(9L);
        when(roomMapper.selectById(9L)).thenReturn(room);

        MeetingRuleService.GlobalRule global = mock(MeetingRuleService.GlobalRule.class);
        when(ruleService.globalRule()).thenReturn(global);
        MeetingRuleService.Effective eff = mock(MeetingRuleService.Effective.class);
        when(ruleService.effectiveFor(room, global)).thenReturn(eff);
        when(eff.getAdvanceDays()).thenReturn(30);
        when(eff.getMinLeadMinutes()).thenReturn(0);
        when(eff.getGranularityMinutes()).thenReturn(15);
        when(eff.getDefaultDurationMinutes()).thenReturn(60);
        when(eff.getMinDuration()).thenReturn(15);
        when(eff.getMaxDuration()).thenReturn(240);
        when(eff.getBookableStart()).thenReturn(java.time.LocalTime.of(8, 0));
        when(eff.getBookableEnd()).thenReturn(java.time.LocalTime.of(22, 0));
        when(eff.getRemindMinutes()).thenReturn(15);
        when(eff.isCheckinRequired()).thenReturn(true);
        when(eff.getCheckinOpenMinutes()).thenReturn(5);
        when(eff.getReleaseAfterMinutes()).thenReturn(15);

        new MeetingRuleSnapshotBackfillInitializer(jdbc, ruleService, bookingMapper, roomMapper).run();

        // 只有“占用中 + 快照为空”的行会被写；UPDATE 再带 rule_snapshot IS NULL 防并发覆盖
        verify(jdbc).update(anyString(), any(Object[].class));
    }

    @Test
    void doesNothingWhenNoLegacyRows() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), eq(Long.class))).thenReturn(List.of());
        MeetingRuleService ruleService = mock(MeetingRuleService.class);

        new MeetingRuleSnapshotBackfillInitializer(jdbc, ruleService,
                mock(MeetingBookingMapper.class), mock(MeetingRoomMapper.class)).run();

        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}

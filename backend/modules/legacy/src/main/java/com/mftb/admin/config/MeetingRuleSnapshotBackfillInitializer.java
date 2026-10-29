package com.mftb.admin.config;

import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.service.MeetingRuleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 存量占用会议规则快照冻结（meeting:rule-snapshot:v1.0）。
 *
 * <p>为什么需要单独一步：快照列新增后，只有「新预约/改期」会写值；
 * 升级前已存在的会议 rule_snapshot 仍为 NULL，任务只能回落到实时规则——
 * 那样一旦管理员改了通用或房间规则，这些已约好的会就被按新规则重判，
 * 与「存量保持预约时规则」的口径相反。因此升级时必须按**当时生效的规则**补写一次。
 *
 * <p>幂等：只处理 rule_snapshot IS NULL 的占用单（booked/checked_in）；
 * 写完后不再命中，重启不会覆盖已冻结的值。
 */
@Slf4j
@Component
@Order(29)
@RequiredArgsConstructor
public class MeetingRuleSnapshotBackfillInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final MeetingRuleService ruleService;
    private final MeetingBookingMapper bookingMapper;
    private final MeetingRoomMapper roomMapper;

    @Override
    public void run(String... args) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM biz_meeting_booking WHERE deleted = 0 AND rule_snapshot IS NULL "
                        + "AND status IN ('booked','checked_in') ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        int frozen = 0;
        for (Long id : ids) {
            MeetingBooking booking = bookingMapper.selectById(id);
            if (booking == null || booking.getStartTime() == null) {
                continue;
            }
            MeetingRoom room = roomMapper.selectById(booking.getRoomId());
            if (room == null) {
                continue;
            }
            MeetingRuleService.Effective eff = ruleService.effectiveFor(room, global);
            LocalDateTime start = booking.getStartTime();
            LocalDateTime remindAt = eff.getRemindMinutes() > 0 ? start.minusMinutes(eff.getRemindMinutes()) : null;
            LocalDateTime checkinOpenAt = start.minusMinutes(Math.max(0, eff.getCheckinOpenMinutes()));
            LocalDateTime releaseDeadlineAt = eff.isCheckinRequired()
                    ? start.plusMinutes(Math.max(1, eff.getReleaseAfterMinutes())) : null;
            // WHERE 再带一次 rule_snapshot IS NULL：并发下若已被新写入填上，不覆盖
            frozen += jdbcTemplate.update(
                    "UPDATE biz_meeting_booking SET rule_snapshot = ?, remind_at = ?, checkin_open_at = ?, "
                            + "release_deadline_at = ?, checkin_required_snapshot = ? "
                            + "WHERE id = ? AND rule_snapshot IS NULL",
                    json(eff), remindAt, checkinOpenAt, releaseDeadlineAt,
                    eff.isCheckinRequired() ? 1 : 0, id);
        }
        if (frozen > 0) {
            log.info("已凍結存量占用會議規則快照: {} 筆（升級後不再受後續規則調整影響）", frozen);
        }
    }

    /** 快照 JSON：只含数字与 HH:mm，不含用户输入 */
    private static String json(MeetingRuleService.Effective eff) {
        return "{"
                + "\"advanceDays\":" + eff.getAdvanceDays() + ","
                + "\"minLeadMinutes\":" + eff.getMinLeadMinutes() + ","
                + "\"granularityMinutes\":" + eff.getGranularityMinutes() + ","
                + "\"defaultDuration\":" + eff.getDefaultDurationMinutes() + ","
                + "\"minDuration\":" + eff.getMinDuration() + ","
                + "\"maxDuration\":" + eff.getMaxDuration() + ","
                + "\"bookableStart\":\"" + eff.getBookableStart() + "\","
                + "\"bookableEnd\":\"" + eff.getBookableEnd() + "\","
                + "\"remindMinutes\":" + eff.getRemindMinutes() + ","
                + "\"checkinRequired\":" + eff.isCheckinRequired() + ","
                + "\"checkinOpenMinutes\":" + eff.getCheckinOpenMinutes() + ","
                + "\"releaseAfterMinutes\":" + eff.getReleaseAfterMinutes()
                + "}";
    }
}

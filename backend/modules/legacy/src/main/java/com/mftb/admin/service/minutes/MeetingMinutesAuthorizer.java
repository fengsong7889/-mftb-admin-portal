package com.mftb.admin.service.minutes;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 纪要录入/编辑鉴权的可复用入口（笔记与 AI 提取共用，与 {@code MeetingMinutesServiceImpl} 同口径）。
 *
 * <p>为什么单独抽出来：AI 辅助录入的接口不能只调「可查看会议」就放行——那会把写入权交给全公司。
 * 它必须复用纪要既有的两把锚：尚无纪要时看「可录入」（相关人/行政 + 会议已进入），
 * 已有纪要时看「可编辑」（记录人/组织者/行政）。判定逻辑与主服务逐字对齐，避免两套权限漂移。
 */
@Component
@RequiredArgsConstructor
public class MeetingMinutesAuthorizer {

    private static final List<String> RECORDABLE_PHASES = List.of("ongoing", "ended", "finished");
    private static final List<String> NON_RECORDABLE_STATUSES = List.of(
            MeetingConstants.STATUS_CANCELLED, MeetingConstants.STATUS_RELEASED);
    private static final String NOT_FOUND = "紀要不存在或已刪除";

    private final MeetingAccessGuard guard;
    private final MeetingBookingMapper bookingMapper;
    private final MeetingMinutesMapper minutesMapper;
    private final MeetingAttendeeMapper attendeeMapper;

    public MeetingBooking requireBooking(long bookingId) {
        MeetingBooking booking = bookingMapper.selectById(bookingId);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        return booking;
    }

    /** 读个人笔记：本人 + 会议可读（组织者/参会人/行政视野）。 */
    public void requireBookingReadable(MeetingBooking booking, SysUser current) {
        guard.requireBookingReadable(booking, current);
    }

    /** 尚无纪要时的「可录入」判定：相关人/行政 + 会议已进入。 */
    public void requireRecordable(MeetingBooking booking, SysUser current) {
        if (!guard.canOperateRecords(current)) {
            if (!isRelated(booking, current) || !guard.canRecordMinutes(current)) {
                throw new BusinessException("只有會議相關人員或行政可以錄入紀要");
            }
        }
        if (!recordableByPhase(booking, LocalDateTime.now())) {
            throw new BusinessException("會議尚未開始或已取消/釋放，無需錄入紀要");
        }
    }

    /** 已有纪要时的「可编辑」判定：记录人本人 / 组织者 / 行政；否则统一按不存在（防枚举）。 */
    public void requireWritable(MeetingMinutes minutes, SysUser current) {
        if (Objects.equals(minutes.getRecorderUserId(), current.getId())) {
            return;
        }
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        if (guard.isOrganizer(booking, current) || guard.canOperateRecords(current)) {
            return;
        }
        throw new BusinessException(NOT_FOUND);
    }

    /**
     * 笔记/AI 提取的统一入口鉴权：先取会议单，无纪要走「可录入」，有纪要走「可编辑」。
     * <p>返回已有纪要（可空），供调用方带基线版本，避免「不存在」与「无权」被混成新建。
     */
    public MeetingMinutes requireEditableForBooking(long bookingId, SysUser current) {
        MeetingBooking booking = requireBooking(bookingId);
        MeetingMinutes minutes = minutesMapper.findByBooking(bookingId);
        if (minutes == null) {
            requireRecordable(booking, current);
            return null;
        }
        requireWritable(minutes, current);
        return minutes;
    }

    private boolean isRelated(MeetingBooking booking, SysUser current) {
        if (guard.isOrganizer(booking, current)) {
            return true;
        }
        return attendeeMapper.selectCount(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, booking.getId())
                .eq(MeetingAttendee::getUserId, current.getId())) > 0;
    }

    private static boolean recordableByPhase(MeetingBooking booking, LocalDateTime now) {
        if (NON_RECORDABLE_STATUSES.contains(booking.getStatus())) {
            return false;
        }
        return RECORDABLE_PHASES.contains(phaseOf(booking, now));
    }

    private static String phaseOf(MeetingBooking booking, LocalDateTime now) {
        if (!MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus())) {
            return booking.getStatus();
        }
        if (booking.getEndTime() == null || !booking.getEndTime().isAfter(now)) {
            return "ended";
        }
        return booking.getStartTime() != null && booking.getStartTime().isAfter(now) ? "pending" : "ongoing";
    }
}

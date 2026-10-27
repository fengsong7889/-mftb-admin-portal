package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingRoom;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

/**
 * 会议预约规则裁决的唯一入口。
 *
 * <p><b>为什么必须集中在一处</b>：预约校验有 7 条规则（时长上下限、时间粒度、提前期、
 * 最远可订天数、每日可预约窗、同日约束、容量上限），分散实现的结果是「新建预约挡了、
 * 改期没挡」——改期本质也是一次窗口占用，任何一条规则漏在改期路径上，
 * 就等于给一个绕过口开了绿灯。所有写入路径（新建/改期/换房）都必须走 {@link #validate}。
 *
 * <p><b>规则两层</b>：房间级列存 NULL 表示"未单独配置"，回落到 sys_config 的 {@code meeting_*} 默认值；
 * 回落动作只发生在这里，服务层拿到的 {@link Effective} 永远是已定稿的生效值。
 *
 * <p>前端也做同样的校验，但那是体验（少一次往返），不是边界：绕过前端直接调接口必须照样被拒。
 */
@Service
@RequiredArgsConstructor
public class MeetingRuleService {

    /** 兜底默认值：sys_config 键缺失或格式非法时使用，保证启动早期也能出价 */
    private static final int DEFAULT_ADVANCE_DAYS = 30;
    private static final int DEFAULT_MIN_LEAD_MINUTES = 0;
    private static final int DEFAULT_DURATION_MINUTES = 60;
    private static final int DEFAULT_MAX_DURATION_MINUTES = 240;
    private static final int DEFAULT_GRANULARITY_MINUTES = 15;
    private static final LocalTime DEFAULT_BOOKABLE_START = LocalTime.of(8, 0);
    private static final LocalTime DEFAULT_BOOKABLE_END = LocalTime.of(22, 0);
    private static final int DEFAULT_REMIND_MINUTES = 15;
    private static final int DEFAULT_CHECKIN_OPEN_MINUTES = 5;
    private static final int DEFAULT_RELEASE_AFTER_MINUTES = 15;

    private final SysConfigService sysConfigService;

    /** 生效规则快照：一次批量读库算出，避免同一请求里逐键多次往返 */
    @Getter
    public static class GlobalRule {
        private final int advanceDays;
        private final int minLeadMinutes;
        private final int defaultDurationMinutes;
        private final int maxDurationMinutes;
        private final int granularityMinutes;
        private final LocalTime bookableStart;
        private final LocalTime bookableEnd;
        private final int remindMinutes;
        private final int checkinOpenMinutes;
        private final int releaseAfterMinutes;

        GlobalRule(int advanceDays, int minLeadMinutes, int defaultDurationMinutes, int maxDurationMinutes,
                   int granularityMinutes, LocalTime bookableStart, LocalTime bookableEnd,
                   int remindMinutes, int checkinOpenMinutes, int releaseAfterMinutes) {
            this.advanceDays = advanceDays;
            this.minLeadMinutes = minLeadMinutes;
            this.defaultDurationMinutes = defaultDurationMinutes;
            this.maxDurationMinutes = maxDurationMinutes;
            this.granularityMinutes = granularityMinutes;
            this.bookableStart = bookableStart;
            this.bookableEnd = bookableEnd;
            this.remindMinutes = remindMinutes;
            this.checkinOpenMinutes = checkinOpenMinutes;
            this.releaseAfterMinutes = releaseAfterMinutes;
        }
    }

    /** 房间级生效规则（已回落全局默认） */
    @Getter
    public static class Effective {
        private final LocalTime bookableStart;
        private final LocalTime bookableEnd;
        private final int minDuration;
        private final int maxDuration;
        private final int granularityMinutes;
        /** 窗口是否来自房间自身（档案页要区分"行政真的配过"与"系统兜底值"） */
        private final boolean windowConfigured;
        private final boolean durationConfigured;

        Effective(LocalTime bookableStart, LocalTime bookableEnd, int minDuration, int maxDuration,
                  int granularityMinutes, boolean windowConfigured, boolean durationConfigured) {
            this.bookableStart = bookableStart;
            this.bookableEnd = bookableEnd;
            this.minDuration = minDuration;
            this.maxDuration = maxDuration;
            this.granularityMinutes = granularityMinutes;
            this.windowConfigured = windowConfigured;
            this.durationConfigured = durationConfigured;
        }
    }

    /** 读取全局默认规则（一次批量取数，格式非法或键缺失一律回落代码默认值） */
    public GlobalRule globalRule() {
        List<String> keys = List.of(
                MeetingConstants.CFG_ADVANCE_DAYS, MeetingConstants.CFG_MIN_LEAD_MINUTES,
                MeetingConstants.CFG_DEFAULT_DURATION, MeetingConstants.CFG_MAX_DURATION,
                MeetingConstants.CFG_TIME_GRANULARITY, MeetingConstants.CFG_BOOKABLE_START,
                MeetingConstants.CFG_BOOKABLE_END, MeetingConstants.CFG_REMIND_MINUTES,
                MeetingConstants.CFG_CHECKIN_OPEN_MINUTES, MeetingConstants.CFG_RELEASE_AFTER);
        Map<String, String> values = sysConfigService.getConfigValues(keys);
        return new GlobalRule(
                parseInt(values.get(MeetingConstants.CFG_ADVANCE_DAYS), DEFAULT_ADVANCE_DAYS),
                parseInt(values.get(MeetingConstants.CFG_MIN_LEAD_MINUTES), DEFAULT_MIN_LEAD_MINUTES),
                parseInt(values.get(MeetingConstants.CFG_DEFAULT_DURATION), DEFAULT_DURATION_MINUTES),
                parseInt(values.get(MeetingConstants.CFG_MAX_DURATION), DEFAULT_MAX_DURATION_MINUTES),
                parseInt(values.get(MeetingConstants.CFG_TIME_GRANULARITY), DEFAULT_GRANULARITY_MINUTES),
                parseTime(values.get(MeetingConstants.CFG_BOOKABLE_START), DEFAULT_BOOKABLE_START),
                parseTime(values.get(MeetingConstants.CFG_BOOKABLE_END), DEFAULT_BOOKABLE_END),
                parseInt(values.get(MeetingConstants.CFG_REMIND_MINUTES), DEFAULT_REMIND_MINUTES),
                parseInt(values.get(MeetingConstants.CFG_CHECKIN_OPEN_MINUTES), DEFAULT_CHECKIN_OPEN_MINUTES),
                parseInt(values.get(MeetingConstants.CFG_RELEASE_AFTER), DEFAULT_RELEASE_AFTER_MINUTES));
    }

    /** 求出某间房的生效规则（房间列为 NULL 时回落全局） */
    public Effective effectiveFor(MeetingRoom room, GlobalRule global) {
        boolean windowConfigured = room.getBookableStartTime() != null || room.getBookableEndTime() != null;
        boolean durationConfigured = room.getMinDuration() != null || room.getMaxDuration() != null;
        LocalTime start = room.getBookableStartTime() != null ? room.getBookableStartTime() : global.getBookableStart();
        LocalTime end = room.getBookableEndTime() != null ? room.getBookableEndTime() : global.getBookableEnd();
        int min = room.getMinDuration() != null ? room.getMinDuration() : global.getGranularityMinutes();
        int max = room.getMaxDuration() != null ? room.getMaxDuration() : global.getMaxDurationMinutes();
        // 上下限倒挂时以"能订出去"为准修正：档案页允许管理员先填一个再补另一个
        if (max < min) {
            max = min;
        }
        // 右端被配到等于/早于左端时视为未配窗口：否则 validate 里的每日窗判定会拒掉一切预约
        if (!end.isAfter(start)) {
            start = global.getBookableStart();
            end = global.getBookableEnd();
        }
        return new Effective(start, end, min, max, global.getGranularityMinutes(),
                windowConfigured, durationConfigured);
    }

    /**
     * 校验一次窗口占用是否成立。
     *
     * @param room          会议室（必须已加锁读取，规则列取当前值）
     * @param start         开始时间
     * @param end           结束时间（左闭右开的开区间右端）
     * @param attendeeCount 参会人数（含组织者与外部人员）
     */
    public void validate(MeetingRoom room, LocalDateTime start, LocalDateTime end, int attendeeCount) {
        GlobalRule global = globalRule();
        validate(room, start, end, attendeeCount, global);
    }

    /** 批量校验入口：周期会议生成多场实例时只读一次全局规则，避免 N 次配置往返 */
    public void validate(MeetingRoom room, LocalDateTime start, LocalDateTime end,
                         int attendeeCount, GlobalRule global) {
        validate(room, start, end, attendeeCount, global, true);
    }

    /**
     * 完整校验入口，可关闭「最远可订天数」这一条。
     *
     * <p>为什么周期会议要放宽它：按 30 天上限，一个「每周三例会 × 12 周」的系列必然只能建出
     * 前 4 场，剩下 8 场静默缺失，比一次性建完更有害（参会人日程上根本看不到后续场次）。
     * 但每日可预约窗、时长上下限、粒度、同日约束与容量**一律照旧**，那些是房间真实承载力与
     * 作息约束，不会因为"它是周期会"就失效。
     */
    public void validate(MeetingRoom room, LocalDateTime start, LocalDateTime end, int attendeeCount,
                         GlobalRule global, boolean enforceAdvanceDays) {
        if (start == null || end == null) {
            throw new BusinessException("請選擇完整的會議起止時間");
        }
        if (room.getBookable() == null || room.getBookable() == 0) {
            throw new BusinessException("該會議室已停止接受預約");
        }
        if (!MeetingConstants.ROOM_ACTIVE.equals(room.getStatus())) {
            throw new BusinessException("該會議室當前狀態不可預約（" + room.getStatus() + "）");
        }
        if (!end.isAfter(start)) {
            throw new BusinessException("結束時間必須晚於開始時間");
        }
        // 跨天会议与"每日可预约窗"语义无法共存（08:00–22:00 不描述跨零点的窗口），直接要求同日
        if (!start.toLocalDate().equals(end.toLocalDate())) {
            throw new BusinessException("會議需在同一天內結束");
        }

        int minutes = (int) Duration.between(start, end).toMinutes();
        int granularity = Math.max(1, global.getGranularityMinutes());
        if (start.getSecond() != 0 || start.getNano() != 0 || end.getSecond() != 0 || end.getNano() != 0) {
            throw new BusinessException("會議時間請精確到分鐘");
        }
        if (minutes % granularity != 0 || start.getMinute() % granularity != 0) {
            throw new BusinessException("會議時間需對齊 " + granularity + " 分鐘刻度");
        }

        Effective eff = effectiveFor(room, global);
        if (minutes < eff.getMinDuration()) {
            throw new BusinessException("會議時長不得少於 " + eff.getMinDuration() + " 分鐘");
        }
        if (minutes > eff.getMaxDuration()) {
            throw new BusinessException("該會議室單場最長 " + eff.getMaxDuration() + " 分鐘");
        }

        if (start.toLocalTime().isBefore(eff.getBookableStart()) || end.toLocalTime().isAfter(eff.getBookableEnd())) {
            throw new BusinessException("該會議室可預約時段為 "
                    + trimToHourMinute(eff.getBookableStart()) + "–" + trimToHourMinute(eff.getBookableEnd()));
        }

        LocalDateTime now = LocalDateTime.now();
        if (start.isBefore(now.plusMinutes(global.getMinLeadMinutes()))) {
            // 提前量为 0 时“需提前 0 分鐘以上预约”读起来像 bug；那条规则当时的真实含义只是“不能约过去”
            throw new BusinessException(global.getMinLeadMinutes() > 0
                    ? "會議需提前 " + global.getMinLeadMinutes() + " 分鐘以上預約"
                    : "會議開始時間不能早於當前時間");
        }
        if (enforceAdvanceDays && start.isAfter(now.plusDays(global.getAdvanceDays()))) {
            throw new BusinessException("最多可提前 " + global.getAdvanceDays() + " 天預約");
        }

        int capacity = room.getCapacity() == null ? 0 : room.getCapacity();
        if (attendeeCount > capacity) {
            throw new BusinessException("參會人數 " + attendeeCount + " 超過該會議室容納上限 "
                    + capacity + " 人");
        }
    }

    private static String trimToHourMinute(LocalTime time) {
        return String.format("%02d:%02d", time.getHour(), time.getMinute());
    }

    private static int parseInt(String raw, int fallback) {
        if (!StringUtils.hasText(raw)) {
            return fallback;
        }
        try {
            return Math.max(0, Integer.parseInt(raw.trim()));
        } catch (NumberFormatException ignored) {
            // 配置被写坏时必须看得出回落了，但不阻断业务：默认值本身就是安全边界
            return fallback;
        }
    }

    private static LocalTime parseTime(String raw, LocalTime fallback) {
        if (!StringUtils.hasText(raw)) {
            return fallback;
        }
        try {
            return LocalTime.parse(raw.trim().length() <= 5 ? raw.trim() + ":00" : raw.trim());
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }
}

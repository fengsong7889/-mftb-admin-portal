package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * RDM 工作日计算公共能力（任务21 抽取）。
 *
 * <p>原先这套「按人例外日历 + 请假 + 周末支援」的工作日算法是
 * {@link com.mftb.admin.service.impl.RdmScheduleServiceImpl} 的私有实现，只有排程用得到。
 * 任务21 把它原样抽成可复用组件，供问题延期期限、逾期升级判定，以及任务27 的
 * 紧急补验工作日期限复用——<b>抽取不改变任何算法语义</b>：调度侧只是从「本地私有方法」
 * 改为「委托本组件」，逐字保持既有行为（{@code RdmScheduleGuardTest} 的请假日推演、
 * 负载标记结论不变）。
 *
 * <p>工作日口径：默认周一至周五 8 小时（{@link RdmWorkCalendar#DEFAULT_DAY_HOURS}），
 * {@code rdm_work_calendar} 只登记例外——leave 当天不可用、overtime/custom 按登记工时（周末支援即由此表达）。
 * 「真实工作日日历」意味着逾期升级/期限推演不是简单的周一至周五，而是把该人的请假与加班日都算进去。
 */
@Component
@RequiredArgsConstructor
public class RdmWorkingDayCalculator {

    /** 一个标准工作日的工时（人时）。与调度侧口径一致。 */
    public static final BigDecimal HOURS_PER_DAY = RdmWorkCalendar.DEFAULT_DAY_HOURS;

    private final RdmWorkCalendarMapper calendarMapper;

    /* ==================== 按人日历 ==================== */

    /**
     * 某个人的工作日历：默认周一至周五 8 小时，表里存在的日子按登记值覆盖。
     * <p>leave 使当天完全不可用；overtime/custom 只要 availableHours &gt; 0 就算可用。
     */
    public static final class DayCalendar {
        private final Map<LocalDate, RdmWorkCalendar> overrides;

        public DayCalendar(Map<LocalDate, RdmWorkCalendar> overrides) {
            this.overrides = overrides == null ? Map.of() : overrides;
        }

        public boolean isWeekend(LocalDate day) {
            DayOfWeek dow = day.getDayOfWeek();
            return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
        }

        public boolean isLeave(LocalDate day) {
            RdmWorkCalendar row = overrides.get(day);
            return row != null && RdmWorkCalendar.TYPE_LEAVE.equals(row.getDayType());
        }

        public boolean isWorking(LocalDate day) {
            return capacity(day).signum() > 0;
        }

        public BigDecimal capacity(LocalDate day) {
            RdmWorkCalendar row = overrides.get(day);
            if (row != null) {
                return row.getAvailableHours() == null
                        ? (RdmWorkCalendar.TYPE_LEAVE.equals(row.getDayType()) ? BigDecimal.ZERO : HOURS_PER_DAY)
                        : row.getAvailableHours();
            }
            return isWeekend(day) ? BigDecimal.ZERO : HOURS_PER_DAY;
        }
    }

    /** 默认日历（无任何按人例外）：周一至周五 8 小时，周末不可用。 */
    public static DayCalendar emptyCalendar() {
        return new DayCalendar(Map.of());
    }

    /**
     * 批量加载多个人在 [from,to] 区间的例外日历（与原调度实现逐字一致）。
     * <p>空集合直接返回空 map，避免生成非法 SQL。
     */
    public Map<Long, DayCalendar> loadCalendars(Set<Long> userIds, LocalDate from, LocalDate to) {
        Map<Long, DayCalendar> map = new LinkedHashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return map;
        }
        Map<Long, Map<LocalDate, RdmWorkCalendar>> buckets = new LinkedHashMap<>();
        userIds.forEach(id -> buckets.put(id, new LinkedHashMap<>()));
        calendarMapper.selectList(new LambdaQueryWrapper<RdmWorkCalendar>()
                        .in(RdmWorkCalendar::getUserId, userIds)
                        .between(RdmWorkCalendar::getDay, from, to))
                .forEach(row -> {
                    Map<LocalDate, RdmWorkCalendar> bucket = buckets.get(row.getUserId());
                    if (bucket != null && row.getDay() != null) {
                        bucket.put(row.getDay(), row);
                    }
                });
        buckets.forEach((id, days) -> map.put(id, new DayCalendar(days)));
        return map;
    }

    /** 加载单个人在 [from,to] 区间的例外日历；userId 为空退化为默认日历。 */
    public DayCalendar calendarFor(Long userId, LocalDate from, LocalDate to) {
        if (userId == null) {
            return emptyCalendar();
        }
        return loadCalendars(Set.of(userId), from, to).getOrDefault(userId, emptyCalendar());
    }

    /* ==================== 静态工作日算法（抽取自调度，语义逐字保持） ==================== */

    /** 归整到当天或之后最近的工作日。 */
    public static LocalDate nextWorking(LocalDate day, DayCalendar calendar) {
        LocalDate cursor = day;
        for (int guard = 0; guard < 400 && !calendar.isWorking(cursor); guard++) {
            cursor = cursor.plusDays(1);
        }
        return cursor;
    }

    /** 归整到当天或之前最近的工作日。 */
    public static LocalDate prevWorking(LocalDate day, DayCalendar calendar) {
        LocalDate cursor = day;
        for (int guard = 0; guard < 400 && !calendar.isWorking(cursor); guard++) {
            cursor = cursor.minusDays(1);
        }
        return cursor;
    }

    /** 从 start（含）数第 n 个工作日。 */
    public static LocalDate nthWorking(LocalDate start, int n, DayCalendar calendar) {
        LocalDate cursor = nextWorking(start, calendar);
        int counted = 1;
        while (counted < Math.max(1, n)) {
            cursor = nextWorking(cursor.plusDays(1), calendar);
            counted++;
        }
        return cursor;
    }

    /** 从 end（含）往前数第 n 个工作日。 */
    public static LocalDate nthWorkingBack(LocalDate end, int n, DayCalendar calendar) {
        LocalDate cursor = prevWorking(end, calendar);
        int counted = 1;
        while (counted < Math.max(1, n)) {
            cursor = prevWorking(cursor.minusDays(1), calendar);
            counted++;
        }
        return cursor;
    }

    /** 按工作日移动（n 可为负），结果归到工作日。 */
    public static LocalDate shift(LocalDate day, int n, DayCalendar calendar) {
        LocalDate cursor = day;
        if (n > 0) {
            for (int i = 0; i < n; i++) {
                cursor = nextWorking(cursor.plusDays(1), calendar);
            }
        } else if (n < 0) {
            for (int i = 0; i < -n; i++) {
                cursor = prevWorking(cursor.minusDays(1), calendar);
            }
        }
        return nextWorking(cursor, calendar);
    }

    /** 含首尾的工作日数。 */
    public static int countWorking(LocalDate from, LocalDate to, DayCalendar calendar) {
        if (from == null || to == null || from.isAfter(to)) {
            return 0;
        }
        int count = 0;
        for (LocalDate cursor = from; !cursor.isAfter(to); cursor = cursor.plusDays(1)) {
            if (calendar.isWorking(cursor)) {
                count++;
            }
        }
        return count;
    }

    /* ==================== 高层便捷（延期期限 / 逾期升级 / 任务27 紧急补验复用） ==================== */

    /**
     * 从 start 起按某人真实工作日历向后推 n 个工作日（n 可负，n=0 归整到工作日）。
     * <p>用于「修复期限 = 批准日 + N 个工作日」这类推演；例外日历按窗口加载。
     */
    public LocalDate addWorkingDays(LocalDate start, int n, Long userId) {
        LocalDate base = start == null ? LocalDate.now() : start;
        long forward = (long) Math.max(30, Math.abs(n)) * 3 + 60;
        DayCalendar calendar = calendarFor(userId, base.minusDays(forward), base.plusDays(forward));
        return shift(base, n, calendar);
    }

    /** [from,to] 含首尾、按某人真实工作日历的工作日数。 */
    public int workingDaysBetween(LocalDate from, LocalDate to, Long userId) {
        if (from == null || to == null || from.isAfter(to)) {
            return 0;
        }
        DayCalendar calendar = calendarFor(userId, from.minusDays(7), to.plusDays(7));
        return countWorking(from, to, calendar);
    }

    /**
     * 逾期工作日数：从 dueAt（不含）到 today（含）之间、落在某人真实工作日历上的工作日数。
     * <p>未逾期（{@code today <= dueAt}）返回 0。<b>用真实工作日历</b>（含请假/周末支援/按人例外），
     * 而非简单的周一至周五——否则请假期间也会被算成逾期，升级判定会失真。
     */
    public int overdueWorkingDays(LocalDate dueAt, LocalDate today, Long userId) {
        if (dueAt == null || today == null || !today.isAfter(dueAt)) {
            return 0;
        }
        DayCalendar calendar = calendarFor(userId, dueAt.minusDays(7), today.plusDays(7));
        return countWorking(dueAt.plusDays(1), today, calendar);
    }
}

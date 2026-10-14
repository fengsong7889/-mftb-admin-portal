package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingSeriesDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 周期实例日期递推测试（创建、预览、改期三条路径共用的同一个算法）。
 *
 * <p>这是周期会议最容易出错也最难在页面上看出来的部分：错一天的表现是"某几场会在周三、某几场在周四"，
 * 而会议单本身看起来完全正常。用例锁的是星期归属、间隔语义、双重上限与幂等跳过口径。
 */
class MeetingSeriesOccurrencesTest {

    private static MeetingSeriesDto.CreateForm form(String freq, int interval, LocalDate start, LocalDate end,
                                                    Integer limit, List<Integer> weekdays) {
        MeetingSeriesDto.CreateForm form = new MeetingSeriesDto.CreateForm();
        form.setTitle("例會");
        form.setRoomId(1L);
        form.setStartDate(start);
        form.setEndDate(end);
        form.setOccurrenceLimit(limit);
        form.setFreq(freq);
        form.setIntervalN(interval);
        form.setByWeekday(weekdays);
        form.setTimeStart("10:00");
        form.setTimeEnd("11:00");
        return form;
    }

    @Test
    @DisplayName("weekly + byWeekday[1,3,5]：起始日为周四时第一批命中周一/三/五")
    void weeklyMultipleWeekdays() {
        // 2026-01-01 是周四。起始日所在的整周（周一起算）里，凡 >= 起始日的 一/三/五 都算第一场：
        // 周五 1-02 与 1-09 属于同一周（周一 12 点才进下一周），所以第一周就是 1-02/1-05/1-07/1-09 四天里
        // 命中 1-02(五)、1-05(一)、1-07(三)、1-09(五) —— 用户选"每周一三五"时，
        // 从周四开始的第一周确实只有周五那一场落在范围内，后续周才是完整三场
        List<LocalDate> days = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_WEEKLY, 1, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 21),
                20, List.of(1, 3, 5)));
        assertEquals(List.of(
                LocalDate.of(2026, 1, 2), LocalDate.of(2026, 1, 5), LocalDate.of(2026, 1, 7),
                LocalDate.of(2026, 1, 9), LocalDate.of(2026, 1, 12), LocalDate.of(2026, 1, 14),
                LocalDate.of(2026, 1, 16), LocalDate.of(2026, 1, 19), LocalDate.of(2026, 1, 21)), days);
        assertTrue(days.stream().allMatch(d -> d.getDayOfWeek().getValue() == 1
                || d.getDayOfWeek().getValue() == 3
                || d.getDayOfWeek().getValue() == 5), "全部落在一/三/五：" + days);
    }

    @Test
    @DisplayName("weekly interval=2：只命中起始周与隔周，不漏不重")
    void biWeekly() {
        List<LocalDate> days = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_WEEKLY, 2, LocalDate.of(2026, 1, 7), LocalDate.of(2026, 2, 25),
                20, List.of(1)));
        // 2026-01-07 是周三，它所在周（周一起算）的周一是 1-05，早于起始日所以跳过。
        // 周序号以起始日所在周为第 0 周，interval=2 命中偶数周的周一：
        // w2=1-19、w4=2-02、w6=2-16；1-12/1-26/2-09/2-23 落在奇数周，不该出现
        assertEquals(List.of(LocalDate.of(2026, 1, 19), LocalDate.of(2026, 2, 2),
                LocalDate.of(2026, 2, 16)), days);
    }

    @Test
    @DisplayName("byWeekday 缺失时退回起始日的星期，而不是变成每天都开")
    void weeklyWithoutWeekdayUsesStartWeekday() {
        List<LocalDate> days = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_WEEKLY, 1, LocalDate.of(2026, 1, 3), LocalDate.of(2026, 2, 3),
                20, List.of()));
        // 2026-01-03 是周六，end=2026-02-03：下一个周六是 2-07，已在 end 之后，不生成
        assertEquals(List.of(LocalDate.of(2026, 1, 3), LocalDate.of(2026, 1, 10), LocalDate.of(2026, 1, 17),
                LocalDate.of(2026, 1, 24), LocalDate.of(2026, 1, 31)), days);
    }

    @Test
    @DisplayName("daily interval=3：每三天一场")
    void dailyWithInterval() {
        List<LocalDate> days = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_DAILY, 3, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 16),
                20, null));
        assertEquals(List.of(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 4), LocalDate.of(2026, 1, 7),
                LocalDate.of(2026, 1, 10), LocalDate.of(2026, 1, 13), LocalDate.of(2026, 1, 16)), days);
    }

    @Test
    @DisplayName("日期上限与次数上限谁先到听谁的（两个都是用户意图，不能只认一个）")
    void bothLimitsApply() {
        List<LocalDate> byLimit = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_DAILY, 1, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 6, 1), 5, null));
        assertEquals(5, byLimit.size());

        List<LocalDate> byEndDate = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_DAILY, 1, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 10), 100, null));
        assertEquals(10, byEndDate.size());
    }

    @Test
    @DisplayName("次数与跨度都有硬上限：写 1000 次也只按 SERIES_MAX_OCCURRENCES 截断")
    void hardCapsApply() {
        List<LocalDate> days = MeetingSeriesService.occurrences(form(
                MeetingConstants.FREQ_DAILY, 1, LocalDate.of(2026, 1, 1), LocalDate.of(2030, 1, 1), 1000, null));
        assertEquals(MeetingConstants.SERIES_MAX_OCCURRENCES, days.size());
        assertTrue(days.size() <= MeetingConstants.SERIES_MAX_SPAN_DAYS);
    }

    @Test
    @DisplayName("结束日期早于开始日期直接拒绝，而不是静默生成 0 场")
    void endBeforeStartIsRejected() {
        MeetingSeriesDto.CreateForm bad = form(MeetingConstants.FREQ_DAILY, 1,
                LocalDate.of(2026, 2, 1), LocalDate.of(2026, 1, 1), 10, null);
        // 全 null 依赖是刻意的：preview 在任何一次数据库访问之前就会因形状校验失败，
        // 如果哪天这里变成了 NPE 而不是 BusinessException，说明校验被挪到了取数之后
        var service = new MeetingSeriesService(null, null, null, null, null, null, null, null);
        assertThrows(RuntimeException.class, () -> service.preview(bad));
    }
}

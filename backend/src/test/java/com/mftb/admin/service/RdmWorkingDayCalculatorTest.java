package com.mftb.admin.service;

import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 工作日计算公共能力测试（任务21 抽取自 RdmScheduleServiceImpl 私有算法）。
 *
 * <p>锁死两类结论：
 * <ol>
 *   <li><b>抽取等价</b>：nextWorking/prevWorking/nthWorking/nthWorkingBack/shift/countWorking 与
 *       DayCalendar 的周末/请假/加班（周末支援）判定与原调度实现逐字一致；</li>
 *   <li><b>真实工作日</b>：高层便捷方法 addWorkingDays/overdueWorkingDays 按某人真实日历计算，
 *       请假日不算工作日、周末支援日算工作日——不是简单的周一至周五。</li>
 * </ol>
 *
 * <p>纯 Mockito 离线单测，不连库。基准周：2026-01-05 为周一。
 */
class RdmWorkingDayCalculatorTest {

    private static final long USER = 41L;
    private static final LocalDate MON = LocalDate.of(2026, 1, 5);
    private static final LocalDate TUE = LocalDate.of(2026, 1, 6);
    private static final LocalDate WED = LocalDate.of(2026, 1, 7);
    private static final LocalDate THU = LocalDate.of(2026, 1, 8);
    private static final LocalDate FRI = LocalDate.of(2026, 1, 9);
    private static final LocalDate SAT = LocalDate.of(2026, 1, 10);
    private static final LocalDate SUN = LocalDate.of(2026, 1, 11);
    private static final LocalDate NEXT_MON = LocalDate.of(2026, 1, 12);

    private RdmWorkCalendarMapper calendarMapper;
    private RdmWorkingDayCalculator calculator;

    @BeforeEach
    void setUp() {
        calendarMapper = mock(RdmWorkCalendarMapper.class);
        when(calendarMapper.selectList(any())).thenReturn(List.of());
        calculator = new RdmWorkingDayCalculator(calendarMapper);
    }

    private static RdmWorkCalendar cal(LocalDate day, String type, String hours) {
        RdmWorkCalendar row = new RdmWorkCalendar();
        row.setUserId(USER);
        row.setDay(day);
        row.setDayType(type);
        row.setAvailableHours(hours == null ? null : new BigDecimal(hours));
        return row;
    }

    private void calendarReturns(RdmWorkCalendar... rows) {
        when(calendarMapper.selectList(any())).thenReturn(List.of(rows));
    }

    /* ==================== 抽取等价：DayCalendar 与静态算法 ==================== */

    @Test
    @DisplayName("默认日历：周一至周五工作、周末不工作（与原调度口径一致）")
    void defaultCalendarWeekdayWorkingWeekendNot() {
        RdmWorkingDayCalculator.DayCalendar empty = RdmWorkingDayCalculator.emptyCalendar();
        assertTrue(empty.isWorking(MON));
        assertTrue(empty.isWorking(FRI));
        assertFalse(empty.isWorking(SAT));
        assertFalse(empty.isWorking(SUN));
        assertTrue(empty.isWeekend(SAT));
        assertFalse(empty.isWeekend(MON));
        assertEquals(new BigDecimal("8"), empty.capacity(MON));
        assertEquals(BigDecimal.ZERO.signum(), empty.capacity(SAT).signum());
    }

    @Test
    @DisplayName("请假日不可用；周末支援（overtime）日可用")
    void leaveNotWorkingOvertimeWorking() {
        RdmWorkingDayCalculator.DayCalendar leaveWed =
                new RdmWorkingDayCalculator.DayCalendar(Map.of(WED, cal(WED, RdmWorkCalendar.TYPE_LEAVE, "0")));
        assertFalse(leaveWed.isWorking(WED));
        assertTrue(leaveWed.isLeave(WED));

        RdmWorkingDayCalculator.DayCalendar satSupport =
                new RdmWorkingDayCalculator.DayCalendar(Map.of(SAT, cal(SAT, RdmWorkCalendar.TYPE_OVERTIME, "8")));
        assertTrue(satSupport.isWorking(SAT));
        assertFalse(satSupport.isWeekend(SAT) && !satSupport.isWorking(SAT));
    }

    @Test
    @DisplayName("nextWorking/prevWorking 跳过周末与请假（抽取等价）")
    void nextPrevWorkingSkipNonWorking() {
        RdmWorkingDayCalculator.DayCalendar empty = RdmWorkingDayCalculator.emptyCalendar();
        assertEquals(NEXT_MON, RdmWorkingDayCalculator.nextWorking(SAT, empty));
        assertEquals(FRI, RdmWorkingDayCalculator.prevWorking(SAT, empty));

        RdmWorkingDayCalculator.DayCalendar leaveWed =
                new RdmWorkingDayCalculator.DayCalendar(Map.of(WED, cal(WED, RdmWorkCalendar.TYPE_LEAVE, "0")));
        assertEquals(THU, RdmWorkingDayCalculator.nextWorking(WED, leaveWed));
        assertEquals(TUE, RdmWorkingDayCalculator.prevWorking(WED, leaveWed));
    }

    @Test
    @DisplayName("countWorking 含首尾；请假日不计入")
    void countWorkingInclusive() {
        RdmWorkingDayCalculator.DayCalendar empty = RdmWorkingDayCalculator.emptyCalendar();
        assertEquals(5, RdmWorkingDayCalculator.countWorking(MON, SUN, empty));
        assertEquals(0, RdmWorkingDayCalculator.countWorking(SAT, SUN, empty));
        assertEquals(0, RdmWorkingDayCalculator.countWorking(FRI, MON, empty)); // from>to → 0

        RdmWorkingDayCalculator.DayCalendar leaveWed =
                new RdmWorkingDayCalculator.DayCalendar(Map.of(WED, cal(WED, RdmWorkCalendar.TYPE_LEAVE, "0")));
        assertEquals(4, RdmWorkingDayCalculator.countWorking(MON, FRI, leaveWed));
    }

    @Test
    @DisplayName("nthWorking/nthWorkingBack/shift 与原调度算法一致")
    void nthAndShift() {
        RdmWorkingDayCalculator.DayCalendar empty = RdmWorkingDayCalculator.emptyCalendar();
        // 从周一含数第 3 个工作日 = 周三
        assertEquals(WED, RdmWorkingDayCalculator.nthWorking(MON, 3, empty));
        // 从周五含数往前第 2 个工作日 = 周四
        assertEquals(THU, RdmWorkingDayCalculator.nthWorkingBack(FRI, 2, empty));
        // shift +1 跨过周末：周五 → 下周一
        assertEquals(NEXT_MON, RdmWorkingDayCalculator.shift(FRI, 1, empty));
        // shift -1 跨过周末：周一(01-05) → 上一个工作日周五(01-02)
        assertEquals(LocalDate.of(2026, 1, 2), RdmWorkingDayCalculator.shift(MON, -1, empty));
    }

    /* ==================== 真实工作日：高层便捷方法 ==================== */

    @Test
    @DisplayName("addWorkingDays 按真实日历：请假日把期限往后推")
    void addWorkingDaysRespectsLeave() {
        // 无例外：周一 +3 工作日 = 周四
        assertEquals(THU, calculator.addWorkingDays(MON, 3, USER));

        // 周三请假：周一 +3 工作日 顺延到周五
        calendarReturns(cal(WED, RdmWorkCalendar.TYPE_LEAVE, "0"));
        assertEquals(FRI, calculator.addWorkingDays(MON, 3, USER));
    }

    @Test
    @DisplayName("addWorkingDays 周末支援日算作工作日")
    void addWorkingDaysCountsWeekendSupport() {
        // 周四 +2 工作日：默认 = 下周一（跨过周五? 不，周四+1=周五,+2=下周一）
        assertEquals(NEXT_MON, calculator.addWorkingDays(THU, 2, USER));
        // 若周六登记周末支援，则 周四 +2 = 周六
        calendarReturns(cal(SAT, RdmWorkCalendar.TYPE_OVERTIME, "8"));
        assertEquals(SAT, calculator.addWorkingDays(THU, 2, USER));
    }

    @Test
    @DisplayName("overdueWorkingDays 未逾期返回 0")
    void overdueZeroWhenNotPastDue() {
        assertEquals(0, calculator.overdueWorkingDays(FRI, MON, USER)); // today 早于 due
        assertEquals(0, calculator.overdueWorkingDays(MON, MON, USER)); // today 等于 due
    }

    @Test
    @DisplayName("overdueWorkingDays 用真实工作日：请假期间不算逾期，周末不算逾期")
    void overdueUsesRealWorkingDays() {
        // due=周一, today=下周一：逾期工作日 = 周二三四五 + 下周一 = 5（跳过周末）
        assertEquals(5, calculator.overdueWorkingDays(MON, NEXT_MON, USER));

        // 周三请假：同样区间逾期工作日减 1 = 4（证明用的是真实日历，非简单周一至周五）
        calendarReturns(cal(WED, RdmWorkCalendar.TYPE_LEAVE, "0"));
        assertEquals(4, calculator.overdueWorkingDays(MON, NEXT_MON, USER));
    }

    @Test
    @DisplayName("workingDaysBetween 含首尾按真实日历计数")
    void workingDaysBetween() {
        assertEquals(5, calculator.workingDaysBetween(MON, FRI, USER));
        calendarReturns(cal(WED, RdmWorkCalendar.TYPE_LEAVE, "0"));
        assertEquals(4, calculator.workingDaysBetween(MON, FRI, USER));
    }
}

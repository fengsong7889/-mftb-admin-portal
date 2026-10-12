package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.entity.AttDaySummary;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttMonthlySummary;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.mapper.AttDaySummaryMapper;
import com.mftb.admin.mapper.AttExceptionMapper;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttMonthlySummaryMapper;
import com.mftb.admin.mapper.AttPunchLogMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.service.AttendanceWorkbenchService;
import com.mftb.admin.service.SysConfigService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 假勤工作台指标测试。
 * <p>
 * 工作台最容易出错的是「与日报口径不一致」和「把没重算当成没人出勤」。
 * 这里钉住：指标全部来自已落库结论表、出勤率按人次加权、无日报行时如实标记未重算、
 * 四类预警各自的触发与不触发条件。
 */
class AttendanceWorkbenchServiceTest {

    /** 2026-10-12 是周一，本周区间为 10-12 ~ 10-18 */
    private static final LocalDate DATE = LocalDate.of(2026, 10, 12);

    @Mock
    private AttDaySummaryMapper dayMapper;
    @Mock
    private AttExceptionMapper exceptionMapper;
    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttGroupMemberMapper memberMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private AttPunchLogMapper punchMapper;
    @Mock
    private AttMonthlySummaryMapper monthlyMapper;
    @Mock
    private AttendanceSummaryService summaryService;
    @Mock
    private SysConfigService sysConfigService;

    private AttendanceWorkbenchService service;

    /** select(SFunction...) 会立即解析列名，纯单测需预热 lambda 缓存（详见 AttendanceSummaryFreezeTest） */
    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(AttDaySummary.class, AttException.class, AttGroup.class,
                AttGroupMember.class, AttSchedule.class, AttPunchLog.class, AttMonthlySummary.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceWorkbenchServiceImpl(dayMapper, exceptionMapper, groupMapper, memberMapper,
                scheduleMapper, punchMapper, monthlyMapper, summaryService, sysConfigService);
        when(sysConfigService.getConfigValueCached(anyString())).thenReturn(null);
    }

    @Test
    @DisplayName("当日指标按日报行求和，出勤率按人次加权而不是各组百分比求平均")
    void aggregatesTodayFromDaySummaries() {
        when(dayMapper.selectList(any())).thenReturn(List.of(
                daySummary(10, 9, 2, 1, 1, 0, 0, new BigDecimal("3.0")),
                daySummary(5, 5, 0, 0, 0, 0, 1, BigDecimal.ZERO)));

        Map<String, Object> stats = stats();

        assertEquals(15, stats.get("shouldAttend"));
        assertEquals(14, stats.get("punched"));
        assertEquals(2, stats.get("late"));
        assertEquals(1, stats.get("leave"));
        assertEquals(Boolean.TRUE, stats.get("calculated"));
        // 14/15 = 93.3%；若按两组百分比求平均会得到 (90.0+100.0)/2 = 95.0
        assertEquals(new BigDecimal("93.3"), stats.get("attendRate"));
        assertEquals(new BigDecimal("3.0"), stats.get("overtimeHours"));
    }

    @Test
    @DisplayName("当日没有日报行时标记未重算，而不是伪装成「今天没人应出勤」")
    void reportsNotCalculatedWhenNoDayRows() {
        when(dayMapper.selectList(any())).thenReturn(List.of());

        Map<String, Object> stats = stats();

        assertEquals(Boolean.FALSE, stats.get("calculated"));
        assertEquals(0, stats.get("shouldAttend"));
    }

    @Test
    @DisplayName("区间异常计数区分待处理与合计，与异常处理页同源")
    void countsRangeExceptions() {
        when(exceptionMapper.selectList(any())).thenReturn(List.of(
                exception(AttException.STATUS_PENDING, AttException.TYPE_LATE),
                exception(AttException.STATUS_PENDING, AttException.TYPE_MISSING_CARD),
                exception(AttException.STATUS_HANDLED, AttException.TYPE_LATE),
                exception(AttException.STATUS_LEAVE, AttException.TYPE_ABSENT)));

        Map<String, Object> stats = stats();

        assertEquals(4, stats.get("rangeExceptions"));
        assertEquals(2L, stats.get("pendingExceptions"));
        assertEquals(2L, stats.get("rangeLate"));
        assertEquals(1L, stats.get("rangeMissing"));
        assertEquals(1L, stats.get("rangeAbsent"));
    }

    @Test
    @DisplayName("未排班预警只针对排班制考勤组：固定班制不排班也能判定，算进来会产生永久预警")
    void warnsUnscheduledForRotationGroupsOnly() {
        when(groupMapper.selectList(any())).thenReturn(List.of(
                group(1L, AttGroup.TYPE_ROTATION, "enabled", "1"),
                group(2L, AttGroup.TYPE_FIXED, "enabled", "1")));
        when(memberMapper.selectList(any())).thenReturn(List.of(member(101L), member(202L)));
        // 只有 101 排了班；202 属排班制却整周无排班
        when(scheduleMapper.selectList(any())).thenReturn(List.of(schedule(101L)));

        Map<String, Object> alert = alert("unscheduled");

        assertNotNull(alert, "排班制有人整周未排班必须预警");
        assertEquals("warn", alert.get("level"));
        assertEquals("/attendance-schedule", alert.get("path"));
        assertEquals(1L, params(alert).get("count"));
        assertEquals("2026-10-12", params(alert).get("weekStart"));
        assertEquals("2026-10-18", params(alert).get("weekEnd"));
    }

    @Test
    @DisplayName("全员已排班或没有排班制考勤组时不产生未排班预警")
    void skipsUnscheduledAlertWhenCovered() {
        when(groupMapper.selectList(any())).thenReturn(List.of(group(2L, AttGroup.TYPE_FIXED, "enabled", "1")));
        assertFalse(hasAlert("unscheduled"), "只有固定班制时不该报未排班");

        when(groupMapper.selectList(any())).thenReturn(List.of(group(1L, AttGroup.TYPE_ROTATION, "enabled", "1")));
        when(memberMapper.selectList(any())).thenReturn(List.of(member(101L)));
        when(scheduleMapper.selectList(any())).thenReturn(List.of(schedule(101L)));
        assertFalse(hasAlert("unscheduled"));
    }

    @Test
    @DisplayName("上月未冻结时给出月份、冻结日与剩余天数（逾期为负数）")
    void warnsWhenLastMonthNotFrozen() {
        when(summaryService.isMonthFrozen("2026-09")).thenReturn(false);
        when(monthlyMapper.selectCount(any())).thenReturn(3L);

        Map<String, Object> alert = alert("unfrozen");

        assertNotNull(alert);
        assertEquals("2026-09", params(alert).get("month"));
        assertEquals(3, params(alert).get("freezeDay"), "未配置时用默认冻结日，与设置页展示一致");
        assertEquals(3L, params(alert).get("draftCount"));
        // 冻结截止 2026-10-03，基准日 10-12 已逾期 9 天
        assertEquals(-9L, params(alert).get("daysLeft"));
        assertEquals("warn", alert.get("level"), "逾期必须升级为 warn");
    }

    @Test
    @DisplayName("上月已冻结则不产生冻结预警")
    void skipsFreezeAlertWhenFrozen() {
        when(summaryService.isMonthFrozen("2026-09")).thenReturn(true);
        assertFalse(hasAlert("unfrozen"));
    }

    @Test
    @DisplayName("开通了钉钉来源却当天没有任何钉钉打卡时预警，已有同步数据则不报")
    void warnsWhenNoDingtalkPunchToday() {
        when(groupMapper.selectList(any())).thenReturn(List.of(group(1L, AttGroup.TYPE_FIXED, "enabled", "1,2")));
        when(punchMapper.selectCount(any())).thenReturn(0L);

        Map<String, Object> alert = alert("noSyncToday");
        assertNotNull(alert);
        assertEquals(1L, params(alert).get("groups"));

        when(punchMapper.selectCount(any())).thenReturn(20L);
        assertFalse(hasAlert("noSyncToday"));
    }

    @Test
    @DisplayName("只开通手工导入的考勤组不参与钉钉同步预警")
    void skipsSyncAlertWithoutDingtalkSource() {
        when(groupMapper.selectList(any())).thenReturn(List.of(group(1L, AttGroup.TYPE_FIXED, "enabled", "2")));
        assertFalse(hasAlert("noSyncToday"));
    }

    @Test
    @DisplayName("停用中的考勤组以 info 级别提示，并带上组名便于定位")
    void listsDisabledGroups() {
        when(groupMapper.selectList(any())).thenReturn(List.of(
                group(1L, AttGroup.TYPE_FIXED, "enabled", "1"),
                group(2L, AttGroup.TYPE_FIXED, "disabled", "1")));

        Map<String, Object> alert = alert("disabledGroups");

        assertNotNull(alert);
        assertEquals("info", alert.get("level"));
        assertEquals(1L, params(alert).get("count"));
        assertTrue(String.valueOf(params(alert).get("names")).contains("門店輪班"));
    }

    /* ==================== 断言辅助 ==================== */

    private Map<String, Object> overview() {
        return service.overview(DATE, null, null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> stats() {
        return (Map<String, Object>) overview().get("stats");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> alerts() {
        return (List<Map<String, Object>>) overview().get("alerts");
    }

    private Map<String, Object> alert(String key) {
        return alerts().stream().filter(a -> key.equals(a.get("key"))).findFirst().orElse(null);
    }

    private boolean hasAlert(String key) {
        return alert(key) != null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> params(Map<String, Object> alert) {
        return (Map<String, Object>) alert.get("params");
    }

    private AttDaySummary daySummary(int should, int actual, int late, int early, int missing, int absent,
                                     int leave, BigDecimal overtime) {
        AttDaySummary row = new AttDaySummary();
        row.setWorkDate(DATE);
        row.setShouldCount(should);
        row.setActualCount(actual);
        row.setLateCount(late);
        row.setEarlyCount(early);
        row.setMissingCount(missing);
        row.setAbsentCount(absent);
        row.setLeaveCount(leave);
        row.setOvertimeHours(overtime);
        return row;
    }

    private AttException exception(int status, int type) {
        AttException row = new AttException();
        row.setStatus(status);
        row.setExceptionType(type);
        row.setWorkDate(DATE);
        return row;
    }

    private AttGroup group(Long id, int type, String status, String sources) {
        AttGroup group = new AttGroup();
        group.setId(id);
        group.setGroupName(id == 1L ? "倉儲物流輪班" : "門店輪班");
        group.setGroupType(type);
        group.setStatus(status);
        group.setPunchSources(sources);
        return group;
    }

    private AttGroupMember member(Long userId) {
        AttGroupMember member = new AttGroupMember();
        member.setGroupId(1L);
        member.setUserId(userId);
        member.setValidFrom(DATE.minusMonths(1));
        return member;
    }

    private AttSchedule schedule(Long userId) {
        AttSchedule schedule = new AttSchedule();
        schedule.setGroupId(1L);
        schedule.setUserId(userId);
        schedule.setWorkDate(DATE);
        schedule.setShiftId(9L);
        return schedule;
    }
}

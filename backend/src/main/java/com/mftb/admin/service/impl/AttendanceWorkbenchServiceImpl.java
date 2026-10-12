package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.AttendanceConstants;
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 假勤工作台指标实现。
 * <p>
 * 三条口径约束：
 * ① 全部指标都从**已落库的结论表**聚合（att_day_summary / att_exception / att_monthly_summary），
 *    不在工作台里重跑判定——两处判定必然出现工作台与日报数字不一致；
 * ② 预警只给结构化数据，文案由前端 i18n 组装；
 * ③ 当日没有日报行时如实返回 0 而不是"暂无数据"，否则界面会把「还没重算」和「真的没人」混为一谈，
 *    并额外给出 {@code calculated} 标志让界面能提示"今日尚未重算"。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceWorkbenchServiceImpl implements AttendanceWorkbenchService {

    private static final String STATUS_ENABLED = "enabled";
    /** 预警级别：warn 需要今天处理，info 只是提醒 */
    private static final String LEVEL_WARN = "warn";
    private static final String LEVEL_INFO = "info";

    private final AttDaySummaryMapper dayMapper;
    private final AttExceptionMapper exceptionMapper;
    private final AttGroupMapper groupMapper;
    private final AttGroupMemberMapper memberMapper;
    private final AttScheduleMapper scheduleMapper;
    private final AttPunchLogMapper punchMapper;
    private final AttMonthlySummaryMapper monthlyMapper;
    private final AttendanceSummaryService summaryService;
    private final SysConfigService sysConfigService;

    @Override
    public Map<String, Object> overview(LocalDate date, LocalDate rangeFrom, LocalDate rangeTo) {
        LocalDate baseDate = date == null ? LocalDate.now() : date;
        LocalDate from = rangeFrom == null ? baseDate.withDayOfMonth(1) : rangeFrom;
        LocalDate to = rangeTo == null ? baseDate : rangeTo;
        if (from.isAfter(to)) {
            LocalDate swap = from;
            from = to;
            to = swap;
        }

        List<AttGroup> groups = groupMapper.selectList(new LambdaQueryWrapper<>());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", baseDate.toString());
        result.put("rangeFrom", from.toString());
        result.put("rangeTo", to.toString());
        result.put("stats", stats(baseDate, from, to));
        result.put("groups", groupStats(groups));
        result.put("alerts", alerts(baseDate, groups));
        return result;
    }

    /* ==================== 指标 ==================== */

    private Map<String, Object> stats(LocalDate date, LocalDate from, LocalDate to) {
        List<AttDaySummary> today = dayMapper.selectList(new LambdaQueryWrapper<AttDaySummary>()
                .eq(AttDaySummary::getWorkDate, date));
        int should = today.stream().mapToInt(r -> nz(r.getShouldCount())).sum();
        int actual = today.stream().mapToInt(r -> nz(r.getActualCount())).sum();

        // 区间异常按状态与类型分别计数：与异常处理页的统计卡同源同口径
        List<AttException> range = exceptionMapper.selectList(new LambdaQueryWrapper<AttException>()
                .ge(AttException::getWorkDate, from)
                .le(AttException::getWorkDate, to)
                .select(AttException::getStatus, AttException::getExceptionType));
        long pending = range.stream()
                .filter(r -> r.getStatus() == null || r.getStatus() == AttException.STATUS_PENDING).count();
        long late = range.stream()
                .filter(r -> Objects.equals(r.getExceptionType(), AttException.TYPE_LATE)).count();
        long missing = range.stream()
                .filter(r -> Objects.equals(r.getExceptionType(), AttException.TYPE_MISSING_CARD)).count();
        long absent = range.stream()
                .filter(r -> Objects.equals(r.getExceptionType(), AttException.TYPE_ABSENT)).count();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("shouldAttend", should);
        stats.put("punched", actual);
        stats.put("late", today.stream().mapToInt(r -> nz(r.getLateCount())).sum());
        stats.put("early", today.stream().mapToInt(r -> nz(r.getEarlyCount())).sum());
        stats.put("missing", today.stream().mapToInt(r -> nz(r.getMissingCount())).sum());
        stats.put("absent", today.stream().mapToInt(r -> nz(r.getAbsentCount())).sum());
        stats.put("leave", today.stream().mapToInt(r -> nz(r.getLeaveCount())).sum());
        stats.put("overtimeHours", today.stream().map(r -> decimal(r.getOvertimeHours()))
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(1, RoundingMode.HALF_UP));
        // 出勤率按人次加权，不是各组百分比求算术平均
        stats.put("attendRate", should == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(actual * 100.0 / should).setScale(1, RoundingMode.HALF_UP));
        // 界面据此区分「今日尚未重算」与「今日真的没人应出勤」
        stats.put("calculated", !today.isEmpty());
        stats.put("pendingExceptions", pending);
        stats.put("rangeExceptions", range.size());
        stats.put("rangeLate", late);
        stats.put("rangeMissing", missing);
        stats.put("rangeAbsent", absent);
        return stats;
    }

    private Map<String, Object> groupStats(List<AttGroup> groups) {
        long enabled = groups.stream().filter(g -> STATUS_ENABLED.equals(g.getStatus())).count();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", groups.size());
        stats.put("enabled", enabled);
        stats.put("disabled", groups.size() - enabled);
        stats.put("rotation", groups.stream()
                .filter(g -> Objects.equals(g.getGroupType(), AttGroup.TYPE_ROTATION)).count());
        return stats;
    }

    /* ==================== 预警 ==================== */

    private List<Map<String, Object>> alerts(LocalDate date, List<AttGroup> groups) {
        List<Map<String, Object>> alerts = new ArrayList<>();
        List<AttGroup> enabled = groups.stream().filter(g -> STATUS_ENABLED.equals(g.getStatus())).toList();

        unscheduledAlert(date, enabled).ifPresent(alerts::add);
        freezeAlert(date).ifPresent(alerts::add);
        noSyncAlert(date, enabled).ifPresent(alerts::add);
        disabledAlert(groups).ifPresent(alerts::add);
        return alerts;
    }

    /**
     * 排班制考勤组本周未排班人数。
     * <p>只算排班制：固定班制不排班也能判定（回落组默认班次），把它们算进来会产生永久预警。
     */
    private java.util.Optional<Map<String, Object>> unscheduledAlert(LocalDate date, List<AttGroup> enabled) {
        List<Long> rotationIds = enabled.stream()
                .filter(g -> Objects.equals(g.getGroupType(), AttGroup.TYPE_ROTATION))
                .map(AttGroup::getId).filter(Objects::nonNull).toList();
        if (rotationIds.isEmpty()) {
            return java.util.Optional.empty();
        }
        LocalDate weekStart = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = weekStart.plusDays(6);
        List<AttGroupMember> members = memberMapper.selectList(new LambdaQueryWrapper<AttGroupMember>()
                .in(AttGroupMember::getGroupId, rotationIds)
                .le(AttGroupMember::getValidFrom, weekEnd)
                .and(w -> w.isNull(AttGroupMember::getValidTo).or().ge(AttGroupMember::getValidTo, weekStart)));
        if (members.isEmpty()) {
            return java.util.Optional.empty();
        }
        Set<Long> scheduled = new HashSet<>(scheduleMapper.selectList(new LambdaQueryWrapper<AttSchedule>()
                        .in(AttSchedule::getUserId, members.stream().map(AttGroupMember::getUserId)
                                .filter(Objects::nonNull).toList())
                        .ge(AttSchedule::getWorkDate, weekStart)
                        .le(AttSchedule::getWorkDate, weekEnd)
                        .select(AttSchedule::getUserId))
                .stream().map(AttSchedule::getUserId).filter(Objects::nonNull).toList());
        long unscheduled = members.stream().map(AttGroupMember::getUserId)
                .filter(Objects::nonNull).distinct().filter(id -> !scheduled.contains(id)).count();
        if (unscheduled == 0) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.of(alert("unscheduled", LEVEL_WARN, "/attendance-schedule",
                Map.of("count", unscheduled, "weekStart", weekStart.toString(), "weekEnd", weekEnd.toString())));
    }

    /** 上月汇总尚未冻结：距冻结日（次月第 N 日）的天数可为负，负数即已逾期 */
    private java.util.Optional<Map<String, Object>> freezeAlert(LocalDate date) {
        YearMonth lastMonth = YearMonth.from(date).minusMonths(1);
        String month = lastMonth.toString();
        if (summaryService.isMonthFrozen(month)) {
            return java.util.Optional.empty();
        }
        Long draft = monthlyMapper.selectCount(new LambdaQueryWrapper<AttMonthlySummary>()
                .eq(AttMonthlySummary::getStatMonth, month)
                .eq(AttMonthlySummary::getStatus, AttMonthlySummary.STATUS_DRAFT));
        int freezeDay = freezeDay();
        LocalDate deadline = lastMonth.plusMonths(1).atDay(Math.min(freezeDay, lastMonth.plusMonths(1).lengthOfMonth()));
        long daysLeft = java.time.temporal.ChronoUnit.DAYS.between(date, deadline);
        return java.util.Optional.of(alert("unfrozen", daysLeft < 0 ? LEVEL_WARN : LEVEL_INFO, "/attendance-monthly",
                Map.of("month", month, "freezeDay", freezeDay, "daysLeft", daysLeft,
                        "draftCount", draft == null ? 0L : draft)));
    }

    /**
     * 今日尚无任何钉钉同步打卡。
     * <p>没有同步日志表，因此用「开通了钉钉来源的组存在，但今天一条钉钉打卡都没有」作为信号；
     * 这个判据会有假阳性（全员休假日），所以级别给 warn 而不是 error，且文案由前端组织。
     */
    private java.util.Optional<Map<String, Object>> noSyncAlert(LocalDate date, List<AttGroup> enabled) {
        long dingtalkGroups = enabled.stream()
                .filter(g -> containsSource(g.getPunchSources(), AttGroup.SOURCE_DINGTALK)).count();
        if (dingtalkGroups == 0) {
            return java.util.Optional.empty();
        }
        Long synced = punchMapper.selectCount(new LambdaQueryWrapper<AttPunchLog>()
                .eq(AttPunchLog::getWorkDate, date)
                .eq(AttPunchLog::getSource, AttPunchLog.SOURCE_DINGTALK));
        if (synced != null && synced > 0) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.of(alert("noSyncToday", LEVEL_WARN, "/attendance-punch",
                Map.of("groups", dingtalkGroups, "date", date.toString())));
    }

    /** 停用中的考勤组：其成员当天不产生任何考勤结论，必须让 HR 看见 */
    private java.util.Optional<Map<String, Object>> disabledAlert(List<AttGroup> groups) {
        List<String> names = groups.stream()
                .filter(g -> !STATUS_ENABLED.equals(g.getStatus()))
                .map(AttGroup::getGroupName).filter(StringUtils::hasText).limit(3).toList();
        if (names.isEmpty()) {
            return java.util.Optional.empty();
        }
        long disabled = groups.stream().filter(g -> !STATUS_ENABLED.equals(g.getStatus())).count();
        return java.util.Optional.of(alert("disabledGroups", LEVEL_INFO, "/attendance-group",
                Map.of("count", disabled, "names", String.join("、", names))));
    }

    private Map<String, Object> alert(String key, String level, String path, Map<String, Object> params) {
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("key", key);
        alert.put("level", level);
        alert.put("path", path);
        alert.put("params", params);
        return alert;
    }

    /** 冻结日读假勤设置，非法值回退默认：与设置页展示保持一致 */
    private int freezeDay() {
        String raw = sysConfigService.getConfigValueCached(AttendanceConstants.CFG_FREEZE_DAY);
        if (!StringUtils.hasText(raw)) {
            return AttendanceConstants.DEFAULT_FREEZE_DAY;
        }
        try {
            int value = Integer.parseInt(raw.trim());
            return value >= 1 && value <= 28 ? value : AttendanceConstants.DEFAULT_FREEZE_DAY;
        } catch (NumberFormatException e) {
            log.warn("考勤冻结日配置不是整数，回退默认值 {}", AttendanceConstants.DEFAULT_FREEZE_DAY);
            return AttendanceConstants.DEFAULT_FREEZE_DAY;
        }
    }

    /** punchSources 是逗号分隔的来源码串（如 "1,2"） */
    private boolean containsSource(String punchSources, int source) {
        if (!StringUtils.hasText(punchSources)) {
            return false;
        }
        return Arrays.stream(punchSources.split(","))
                .map(String::trim).anyMatch(code -> code.equals(String.valueOf(source)));
    }

    private static int nz(Integer value) {
        return value == null ? 0 : value;
    }

    private static BigDecimal decimal(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}

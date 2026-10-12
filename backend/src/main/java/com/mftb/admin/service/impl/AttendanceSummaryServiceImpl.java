package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.dto.AttendanceDailyVO;
import com.mftb.admin.dto.AttendanceMonthlyVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttDaySummary;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttHoliday;
import com.mftb.admin.entity.AttMonthlySummary;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.mapper.AttDaySummaryMapper;
import com.mftb.admin.mapper.AttExceptionMapper;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttHolidayMapper;
import com.mftb.admin.mapper.AttMonthlySummaryMapper;
import com.mftb.admin.mapper.AttPunchLogMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 考勤汇总与判定实现。
 * <p>
 * 一个「人日结论」{@link PersonalDay} 同时喂给日报（日 × 组聚合）与月报（月 × 人聚合），
 * 判定规则只在这里写一次。两边各写一套必然出现"日报对、月报错"而对不上账，
 * 而月报是薪酬取数来源，错一天就是错发工资。
 * <p>
 * 三条刻意保守的口径：
 * ① 判定不了的不硬判：没有班次基准（自由工时、班次被删）时只记出勤事实，不产迟到/早退；
 * ② 已处理的异常不回退：补卡通过后旧异常保持「已補卡」，重算只新增不改状态；
 * ③ 已冻结月份整体跳过重算，避免薪酬引用值与页面值不一致。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceSummaryServiceImpl implements AttendanceSummaryService {

    private static final String STATUS_ENABLED = "enabled";
    /** 加班类别：工作日 / 休息日 / 法定节假日 */
    private static final int OT_WORKDAY = 1;
    private static final int OT_RESTDAY = 2;
    private static final int OT_HOLIDAY = 3;

    private final AttGroupMapper groupMapper;
    private final AttGroupMemberMapper memberMapper;
    private final AttScheduleMapper scheduleMapper;
    private final AttShiftMapper shiftMapper;
    private final AttPunchLogMapper punchMapper;
    private final AttExceptionMapper exceptionMapper;
    private final AttDaySummaryMapper dayMapper;
    private final AttMonthlySummaryMapper monthlyMapper;
    private final AttHolidayMapper holidayMapper;
    private final HrLeaveRequestMapper leaveMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final SysConfigService sysConfigService;

    /** 单人单日的考勤结论 */
    static class PersonalDay {
        Long userId;
        String empNo = "";
        String empName = "";
        Long deptId;
        String deptName = "";
        LocalDate date;
        boolean shouldAttend;
        boolean attended;
        boolean onLeave;
        boolean unscheduled;
        int lateMinutes;
        int earlyMinutes;
        boolean missingCard;
        boolean absent;
        BigDecimal overtime = BigDecimal.ZERO;
        int overtimeKind = OT_WORKDAY;
        /**
         * 当日已按时间排序的打卡流水（来自 {@link DayContext}，不重查）。
         * <p>带着走而不是回写时再查一次：回写需要知道「上一轮把哪张卡标成了迟到」才能复位，
         * 而重算一个人一天再查一次库会把月度重算放大成十万级查询。
         */
        List<AttPunchLog> punches = List.of();
    }

    /** 一天的计算上下文：一次性把成员/排班/班次/打卡/请假/节假日全部载入 */
    private static class DayContext {
        List<AttGroupMember> members = List.of();
        Map<Long, AttSchedule> scheduleByUser = Map.of();
        Map<Long, AttShift> shifts = Map.of();
        Map<Long, List<AttPunchLog>> punchesByUser = Map.of();
        Set<Long> leaveUsers = Set.of();
        Map<Long, String> leaveTypeByUser = Map.of();
        AttHoliday holiday;
    }

    /* ==================== 日汇总 ==================== */

    @Override
    @Transactional
    public Map<String, Object> recalculateDaily(LocalDate from, LocalDate to, Long groupId) {
        if (from == null || to == null || from.isAfter(to)) {
            throw new BusinessException("重算日期區間不合法");
        }
        if (from.plusDays(92).isBefore(to)) {
            throw new BusinessException("單次重算區間不得超過 92 天");
        }
        List<AttGroup> groups = targetGroups(groupId);
        Set<String> frozenMonths = frozenMonths();
        int days = 0;
        int skippedFrozen = 0;
        int exceptions = 0;
        String operator = operatorResolver.currentOperatorName();
        for (AttGroup group : groups) {
            for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
                if (frozenMonths.contains(YearMonth.from(date).toString())) {
                    skippedFrozen++;
                    continue;
                }
                List<PersonalDay> results = calculate(group, date);
                upsertDaySummary(group, date, results, operator);
                exceptions += upsertExceptions(group, date, results, operator);
                days++;
            }
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("groups", groups.size());
        summary.put("recalculated", days);
        summary.put("skippedFrozen", skippedFrozen);
        summary.put("exceptions", exceptions);
        log.info("考勤日報重算完成: 組數={}, 重算日數={}, 跳過已凍結={}, 異常落庫={}",
                groups.size(), days, skippedFrozen, exceptions);
        return summary;
    }

    @Override
    public PageResult<AttendanceDailyVO> dailyPage(long page, long size, LocalDate from, LocalDate to,
                                                   Long groupId, Long deptId) {
        Page<AttDaySummary> result = dayMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                dailyFilter(from, to, groupId, deptId).orderByDesc(AttDaySummary::getWorkDate)
                        .orderByAsc(AttDaySummary::getGroupId));
        List<AttendanceDailyVO> vos = result.getRecords().stream().map(AttendanceDailyVO::of).toList();
        return new PageResult<>(vos, result.getTotal());
    }

    @Override
    public Map<String, Object> dailyStats(LocalDate from, LocalDate to, Long groupId, Long deptId) {
        List<AttDaySummary> rows = dayMapper.selectList(dailyFilter(from, to, groupId, deptId));
        int should = rows.stream().mapToInt(r -> nullToZero(r.getShouldCount())).sum();
        int actual = rows.stream().mapToInt(r -> nullToZero(r.getActualCount())).sum();
        int abnormal = rows.stream().mapToInt(r -> nullToZero(r.getLateCount()) + nullToZero(r.getEarlyCount())
                + nullToZero(r.getMissingCount()) + nullToZero(r.getAbsentCount())).sum();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("should", should);
        stats.put("actual", actual);
        stats.put("abnormal", abnormal);
        // 出勤率按人次加权，不是各行百分比求平均——小组会把算术平均拉偏
        stats.put("rate", should == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(actual * 100.0 / should).setScale(1, RoundingMode.HALF_UP));
        return stats;
    }

    /* ==================== 月汇总 ==================== */

    @Override
    @Transactional
    public Map<String, Object> generateMonthly(String month, Long groupId) {
        YearMonth yearMonth = parseMonth(month);
        List<AttGroup> groups = targetGroups(groupId);
        Map<Long, Map<String, PersonalDay>> byUser = new LinkedHashMap<>();
        for (AttGroup group : groups) {
            for (LocalDate date = yearMonth.atDay(1); !date.isAfter(yearMonth.atEndOfMonth()); date = date.plusDays(1)) {
                for (PersonalDay day : calculate(group, date)) {
                    Map<String, PersonalDay> userDays = byUser.computeIfAbsent(day.userId, key -> new LinkedHashMap<>());
                    // 同人同月同日只保留一条：正常情况下人只属于一个组，出现重复说明归属有冲突
                    userDays.putIfAbsent(date.toString(), day);
                }
            }
        }
        String operator = operatorResolver.currentOperatorName();
        int generated = 0;
        int skippedLocked = 0;
        for (Map.Entry<Long, Map<String, PersonalDay>> entry : byUser.entrySet()) {
            List<PersonalDay> days = new ArrayList<>(entry.getValue().values());
            AttMonthlySummary existing = monthlyMapper.selectOne(new LambdaQueryWrapper<AttMonthlySummary>()
                    .eq(AttMonthlySummary::getUserId, entry.getKey())
                    .eq(AttMonthlySummary::getStatMonth, yearMonth.toString())
                    .last("LIMIT 1"));
            if (existing != null && !AttMonthlySummary.STATUS_DRAFT.equals(existing.getStatus())) {
                skippedLocked++;
                continue;
            }
            AttMonthlySummary summary = aggregateMonth(entry.getKey(), yearMonth.toString(), days, existing);
            if (existing == null) {
                summary.setCreatedBy(operator);
                monthlyMapper.insert(summary);
            } else {
                summary.setUpdatedBy(operator);
                monthlyMapper.updateById(summary);
            }
            generated++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month", yearMonth.toString());
        result.put("generated", generated);
        result.put("skippedLocked", skippedLocked);
        log.info("月度考勤匯總生成完成: 月份={}, 生成/刷新={}, 跳過已凍結或已同步={}",
                yearMonth, generated, skippedLocked);
        return result;
    }

    @Override
    public PageResult<AttendanceMonthlyVO> monthlyPage(long page, long size, String month, Long groupId, Long deptId,
                                                       String keyword, String status) {
        Page<AttMonthlySummary> result = monthlyMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                monthlyFilter(month, groupId, deptId, keyword, status)
                        .orderByDesc(AttMonthlySummary::getStatMonth).orderByAsc(AttMonthlySummary::getEmpNo));
        List<AttendanceMonthlyVO> vos = result.getRecords().stream().map(AttendanceMonthlyVO::of).toList();
        return new PageResult<>(vos, result.getTotal());
    }

    @Override
    public Map<String, Object> monthlyStats(String month, Long groupId, Long deptId, String keyword, String status) {
        List<AttMonthlySummary> rows = monthlyMapper.selectList(monthlyFilter(month, groupId, deptId, keyword, status));
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("should", rows.stream().map(AttMonthlySummary::getShouldDays).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(1, RoundingMode.HALF_UP));
        stats.put("actual", rows.stream().map(AttMonthlySummary::getActualDays).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(1, RoundingMode.HALF_UP));
        stats.put("abnormal", rows.stream().filter(r -> nullToZero(r.getLateTimes()) + nullToZero(r.getEarlyTimes())
                + nullToZero(r.getMissingTimes()) > 0 || decimal(r.getAbsentDays()).signum() > 0).count());
        stats.put("draft", rows.stream().filter(r -> AttMonthlySummary.STATUS_DRAFT.equals(r.getStatus())).count());
        return stats;
    }

    @Override
    @Transactional
    public Map<String, Object> freeze(List<Long> ids) {
        return transition(ids, AttMonthlySummary.STATUS_DRAFT, AttMonthlySummary.STATUS_FROZEN, true);
    }

    @Override
    @Transactional
    public Map<String, Object> syncToPayroll(List<Long> ids) {
        return transition(ids, AttMonthlySummary.STATUS_FROZEN, AttMonthlySummary.STATUS_SYNCED, false);
    }

    @Override
    public boolean isMonthFrozen(String month) {
        Long count = monthlyMapper.selectCount(new LambdaQueryWrapper<AttMonthlySummary>()
                .eq(AttMonthlySummary::getStatMonth, month)
                .in(AttMonthlySummary::getStatus, AttMonthlySummary.STATUS_FROZEN, AttMonthlySummary.STATUS_SYNCED));
        return count != null && count > 0;
    }

    /* ==================== 判定核心 ==================== */

    /** 单人单日结论；组停用或该人无归属时返回空 */
    private List<PersonalDay> calculate(AttGroup group, LocalDate date) {
        if (!STATUS_ENABLED.equals(group.getStatus())) {
            return List.of();
        }
        DayContext ctx = loadContext(group, date);
        if (ctx.members.isEmpty()) {
            return List.of();
        }
        boolean holidayOff = ctx.holiday != null && ctx.holiday.getHolidayType() != AttHoliday.TYPE_SWAP_WORKDAY;
        List<PersonalDay> results = new ArrayList<>();
        for (AttGroupMember member : ctx.members) {
            AttSchedule schedule = ctx.scheduleByUser.get(member.getUserId());
            // 排班制没有排班记录 = 漏排；固定班制没有排班记录时回落到组默认班次
            if (schedule == null && Objects.equals(group.getGroupType(), AttGroup.TYPE_ROTATION)) {
                PersonalDay day = newPersonalDay(member, date);
                day.unscheduled = true;
                day.punches = ctx.punchesByUser.getOrDefault(member.getUserId(), List.of());
                results.add(day);
                continue;
            }
            Long shiftId = schedule != null ? schedule.getShiftId() : group.getShiftId();
            if (schedule != null && schedule.getShiftId() == null) {
                // 显式排休：不计应出勤；若当天真的打了卡，按休息日加班处理
                PersonalDay rest = newPersonalDay(member, date);
                rest.shouldAttend = false;
                List<AttPunchLog> punches = ctx.punchesByUser.getOrDefault(member.getUserId(), List.of());
                rest.punches = punches;
                if (!punches.isEmpty()) {
                    rest.attended = true;
                    rest.overtime = spanHours(punches);
                    rest.overtimeKind = OT_RESTDAY;
                }
                results.add(rest);
                continue;
            }
            if (holidayOff && schedule == null) {
                PersonalDay off = newPersonalDay(member, date);
                off.shouldAttend = false;
                off.punches = ctx.punchesByUser.getOrDefault(member.getUserId(), List.of());
                results.add(off);
                continue;
            }
            results.add(judge(group, member, date, shiftId, ctx, holidayOff));
        }
        return results;
    }

    private PersonalDay judge(AttGroup group, AttGroupMember member, LocalDate date, Long shiftId,
                              DayContext ctx, boolean holidayOff) {
        PersonalDay day = newPersonalDay(member, date);
        day.shouldAttend = true;
        List<AttPunchLog> punches = new ArrayList<>(ctx.punchesByUser.getOrDefault(member.getUserId(), List.of()));
        punches.sort(Comparator.comparing(AttPunchLog::getPunchAt, Comparator.nullsLast(Comparator.naturalOrder())));
        day.punches = punches;
        day.onLeave = ctx.leaveUsers.contains(member.getUserId());

        if (punches.isEmpty()) {
            if (day.onLeave) {
                day.shouldAttend = false;   // 请假覆盖当天：不算旷工，也不计应出勤
            } else {
                day.absent = true;
            }
            return day;
        }
        day.attended = true;
        AttShift shift = shiftId == null ? null : ctx.shifts.get(shiftId);
        if (shift == null || shift.getOnTime() == null || shift.getOffTime() == null) {
            // 没有班次基准就不硬判迟到早退（自由工时、班次已删），只记出勤事实
            if (holidayOff && punches.size() >= 2) {
                day.overtimeKind = OT_HOLIDAY;
                day.overtime = spanHours(punches);
            }
            return day;
        }
        LocalDateTime onAt = punches.get(0).getPunchAt();
        LocalDateTime offAt = punches.get(punches.size() - 1).getPunchAt();
        LocalDateTime onDeadline = date.atTime(shift.getOnTime()).plusMinutes(group.getLateGraceMin() == null ? 0 : group.getLateGraceMin());
        LocalDateTime offDeadline = offDateTime(shift, date).minusMinutes(group.getEarlyGraceMin() == null ? 0 : group.getEarlyGraceMin());
        if (onAt.isAfter(onDeadline)) {
            day.lateMinutes = (int) Duration.between(onDeadline, onAt).toMinutes();
        }
        if (offAt.isBefore(offDeadline)) {
            day.earlyMinutes = (int) Duration.between(offAt, offDeadline).toMinutes();
        }
        if (punches.size() < 2) {
            day.missingCard = true;
        }
        long overtimeMinutes = Math.max(0, Duration.between(offDeadline, offAt).toMinutes());
        if (overtimeMinutes >= overtimeThresholdMinutes()) {
            day.overtime = stepFloor(BigDecimal.valueOf(overtimeMinutes / 60.0));
            day.overtimeKind = holidayOff ? OT_HOLIDAY : OT_WORKDAY;
        }
        return day;
    }

    private PersonalDay newPersonalDay(AttGroupMember member, LocalDate date) {
        PersonalDay day = new PersonalDay();
        day.userId = member.getUserId();
        day.empNo = member.getEmpNo();
        day.empName = member.getEmpName();
        day.deptId = member.getDeptId();
        day.deptName = member.getDeptName();
        day.date = date;
        return day;
    }

    /** 加班时数按步长向下进位（步长取自假勤设置） */
    private BigDecimal stepFloor(BigDecimal hours) {
        BigDecimal step = overtimeStepHours();
        return hours.divide(step, 0, RoundingMode.DOWN).multiply(step).setScale(1, RoundingMode.DOWN);
    }

    /* ==================== 口径参数（假勤设置） ==================== */

    /**
     * 加班起算门槛（分钟）。
     * <p>用带缓存的配置读取而不是每次查库：本方法在「人 × 天」的循环里被调用，
     * 直接查库会把一次月度重算放大成十万级请求。
     */
    private int overtimeThresholdMinutes() {
        return intConfig(AttendanceConstants.CFG_OVERTIME_THRESHOLD_MIN,
                AttendanceConstants.DEFAULT_OVERTIME_THRESHOLD_MIN, 0, 480);
    }

    /** 加班进位步长（小时）：设置页以分钟录入，这里换算成小时供工时累加 */
    private BigDecimal overtimeStepHours() {
        int minutes = intConfig(AttendanceConstants.CFG_OVERTIME_STEP_MIN,
                AttendanceConstants.DEFAULT_OVERTIME_STEP_MIN, 5, 240);
        return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    /**
     * 读整数口径参数：未配置、不是数字、超出合理区间一律回退默认值。
     * <p>不得让一个写错的配置值把整月考勤算成零或负数；越界只记警告不抛错，
     * 否则重算会在定时任务里直接失败而无人知晓。
     */
    private int intConfig(String key, int fallback, int min, int max) {
        String raw = sysConfigService.getConfigValueCached(key);
        if (!StringUtils.hasText(raw)) {
            return fallback;
        }
        try {
            int value = Integer.parseInt(raw.trim());
            if (value < min || value > max) {
                log.warn("考勤口径参数 {} = {} 超出合理区间[{}, {}]，回退默认值 {}", key, value, min, max, fallback);
                return fallback;
            }
            return value;
        } catch (NumberFormatException e) {
            log.warn("考勤口径参数 {} 不是整数（提交值已忽略），回退默认值 {}", key, fallback);
            return fallback;
        }
    }

    private static LocalDateTime offDateTime(AttShift shift, LocalDate date) {
        LocalDateTime base = date.atTime(shift.getOffTime());
        return Integer.valueOf(1).equals(shift.getCrossDay()) ? base.plusDays(1) : base;
    }

    /** 无班次基准时的在勤跳度（休息日上班、法定假日上班）：按首尾卡跳度折算，按 0.5 小时向下进位 */
    private BigDecimal spanHours(List<AttPunchLog> punches) {
        if (punches.size() < 2) {
            return BigDecimal.ZERO;
        }
        long minutes = Duration.between(punches.get(0).getPunchAt(), punches.get(punches.size() - 1).getPunchAt()).toMinutes();
        return stepFloor(BigDecimal.valueOf(minutes / 60.0));
    }

    private DayContext loadContext(AttGroup group, LocalDate date) {
        DayContext ctx = new DayContext();
        ctx.members = memberMapper.selectList(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getGroupId, group.getId())
                .le(AttGroupMember::getValidFrom, date)
                .and(w -> w.isNull(AttGroupMember::getValidTo).or().ge(AttGroupMember::getValidTo, date)));
        if (ctx.members.isEmpty()) {
            return ctx;
        }
        List<Long> userIds = ctx.members.stream().map(AttGroupMember::getUserId).filter(Objects::nonNull).toList();
        ctx.scheduleByUser = scheduleMapper.selectList(new LambdaQueryWrapper<AttSchedule>()
                        .in(AttSchedule::getUserId, userIds).eq(AttSchedule::getWorkDate, date))
                .stream().collect(Collectors.toMap(AttSchedule::getUserId, s -> s, (a, b) -> a));
        ctx.punchesByUser = punchMapper.selectList(new LambdaQueryWrapper<AttPunchLog>()
                        .in(AttPunchLog::getUserId, userIds).eq(AttPunchLog::getWorkDate, date)
                        .ne(AttPunchLog::getResult, AttPunchLog.RESULT_INVALID)
                        .orderByAsc(AttPunchLog::getPunchAt))
                .stream().collect(Collectors.groupingBy(AttPunchLog::getUserId));
        ctx.leaveUsers = leaveMapper.selectList(new LambdaQueryWrapper<HrLeaveRequest>()
                        .in(HrLeaveRequest::getUserId, userIds)
                        .le(HrLeaveRequest::getStartDate, date)
                        .ge(HrLeaveRequest::getEndDate, date)
                        .in(HrLeaveRequest::getStatus, List.of(HrLeaveConstants.STATUS_APPROVED, HrLeaveConstants.STATUS_COMPLETED)))
                .stream().map(HrLeaveRequest::getUserId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> shiftIds = new java.util.HashSet<>();
        ctx.scheduleByUser.values().forEach(s -> {
            if (s.getShiftId() != null) {
                shiftIds.add(s.getShiftId());
            }
        });
        if (group.getShiftId() != null) {
            shiftIds.add(group.getShiftId());
        }
        ctx.shifts = shiftIds.isEmpty() ? Map.of()
                : shiftMapper.selectBatchIds(shiftIds).stream().collect(Collectors.toMap(AttShift::getId, s -> s));
        ctx.holiday = holidayMapper.selectOne(new LambdaQueryWrapper<AttHoliday>()
                .eq(AttHoliday::getHolidayDate, date)
                .eq(AttHoliday::getStatus, STATUS_ENABLED)
                .last("LIMIT 1"));
        return ctx;
    }

    /* ==================== 落库 ==================== */

    private void upsertDaySummary(AttGroup group, LocalDate date, List<PersonalDay> results, String operator) {
        AttDaySummary row = dayMapper.selectOne(new LambdaQueryWrapper<AttDaySummary>()
                .eq(AttDaySummary::getGroupId, group.getId())
                .eq(AttDaySummary::getWorkDate, date)
                .last("LIMIT 1"));
        if (row == null) {
            row = new AttDaySummary();
            row.setGroupId(group.getId());
            row.setWorkDate(date);
            row.setCreatedBy(operator);
        }
        row.setGroupName(group.getGroupName());
        row.setDeptId(results.stream().map(d -> d.deptId).filter(Objects::nonNull).findFirst().orElse(null));
        row.setDeptName(results.stream().map(d -> d.deptName).filter(StringUtils::hasText).findFirst().orElse(""));
        row.setShouldCount((int) results.stream().filter(d -> d.shouldAttend).count());
        row.setActualCount((int) results.stream().filter(d -> d.attended).count());
        row.setLateCount((int) results.stream().filter(d -> d.lateMinutes > 0).count());
        row.setEarlyCount((int) results.stream().filter(d -> d.earlyMinutes > 0).count());
        row.setMissingCount((int) results.stream().filter(d -> d.missingCard).count());
        row.setAbsentCount((int) results.stream().filter(d -> d.absent).count());
        row.setLeaveCount((int) results.stream().filter(d -> d.onLeave).count());
        row.setOvertimeHours(results.stream().map(d -> d.overtime).reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(1, RoundingMode.HALF_UP));
        int should = row.getShouldCount();
        int actual = row.getActualCount();
        row.setAttendRate(should == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(actual * 100.0 / should).setScale(2, RoundingMode.HALF_UP));
        row.setCalculatedAt(LocalDateTime.now());
        row.setUpdatedBy(operator);
        if (row.getId() == null) {
            dayMapper.insert(row);
        } else {
            dayMapper.updateById(row);
        }
        writeBackPunchResults(results, operator);
    }

    /**
     * 把判定结果回写到打卡流水，界面才能解释"这张卡为什么算迟到"。
     * <p>必须**双向**回写：补卡或请假抵扣后当天不再迟到时，上一轮写的「遲到」要复位成「正常」，
     * 否则打卡记录页显示迟到而日报显示正常，两个页面永远对不上（而薪酬是按日报取的）。
     * <p>打卡流水直接用 {@link PersonalDay#punches}（loadContext 已批量载入），不逐人重查：
     * 月度重算本就是「人 × 天」量级，每人每天多一次查询会把它放大成十万级请求。
     */
    private void writeBackPunchResults(List<PersonalDay> results, String operator) {
        for (PersonalDay day : results) {
            List<AttPunchLog> punches = day.punches;
            if (punches.isEmpty()) {
                continue;
            }
            AttPunchLog first = punches.get(0);
            AttPunchLog last = punches.get(punches.size() - 1);
            if (day.lateMinutes > 0) {
                markResult(first, AttPunchLog.RESULT_LATE, operator);
            } else {
                resetStaleResult(first, AttPunchLog.RESULT_LATE, operator);
            }
            if (day.earlyMinutes > 0) {
                markResult(last, AttPunchLog.RESULT_EARLY, operator);
            } else {
                resetStaleResult(last, AttPunchLog.RESULT_EARLY, operator);
            }
        }
    }

    private void markResult(AttPunchLog punch, int result, String operator) {
        if (Objects.equals(punch.getResult(), result)
                || Objects.equals(punch.getResult(), AttPunchLog.RESULT_OUTSIDE)) {
            return;
        }
        punch.setResult(result);
        punch.setUpdatedBy(operator);
        punchMapper.updateById(punch);
    }

    /**
     * 只复位引擎自己写过的过期判定。
     * <p>外勤与无效卡是人工认定的业务事实，不得被自动判定覆盖；
     * 因此这里只在当前值恰好等于过期标记时才改回正常。
     */
    private void resetStaleResult(AttPunchLog punch, int stale, String operator) {
        if (Objects.equals(punch.getResult(), stale)) {
            markResult(punch, AttPunchLog.RESULT_NORMAL, operator);
        }
    }

    /**
     * 异常只新增与更新明细，不改已处理状态。
     * <p>补卡通过后重算不会再产生同一条异常（卡已补齐）；若异常已被人工确认或抵扣，
     * 重算把它退回「待處理」会让审批结果丢失，所以 status != pending 的行原样保留。
     */
    private int upsertExceptions(AttGroup group, LocalDate date, List<PersonalDay> results, String operator) {
        int written = 0;
        for (PersonalDay day : results) {
            Map<Integer, String> found = new LinkedHashMap<>();
            if (day.lateMinutes > 0) {
                found.put(AttException.TYPE_LATE, "遲到 " + day.lateMinutes + " 分鐘");
            }
            if (day.earlyMinutes > 0) {
                found.put(AttException.TYPE_EARLY, "早退 " + day.earlyMinutes + " 分鐘");
            }
            if (day.missingCard) {
                found.put(AttException.TYPE_MISSING_CARD, "缺上班卡或下班卡");
            }
            if (day.absent) {
                found.put(AttException.TYPE_ABSENT, "全日無打卡紀錄且無有效假單");
            }
            if (day.unscheduled) {
                found.put(AttException.TYPE_UNSCHEDULED, "當日未排班");
            }
            for (Map.Entry<Integer, String> entry : found.entrySet()) {
                written += upsertException(group, day, date, entry.getKey(), entry.getValue(),
                        day.lateMinutes, operator);
            }
        }
        return written;
    }

    private int upsertException(AttGroup group, PersonalDay day, LocalDate date, int type, String detail,
                                int lateMinutes, String operator) {
        AttException existing = exceptionMapper.selectOne(new LambdaQueryWrapper<AttException>()
                .eq(AttException::getUserId, day.userId)
                .eq(AttException::getWorkDate, date)
                .eq(AttException::getExceptionType, type)
                .last("LIMIT 1"));
        if (existing != null) {
            if (existing.getStatus() != null && existing.getStatus() != AttException.STATUS_PENDING) {
                return 0;
            }
            existing.setDetail(detail);
            existing.setLateMinutes(lateMinutes);
            existing.setUpdatedBy(operator);
            exceptionMapper.updateById(existing);
            return 0;
        }
        AttException record = new AttException();
        record.setUserId(day.userId);
        record.setEmpNo(day.empNo);
        record.setEmpName(day.empName);
        record.setDeptId(day.deptId);
        record.setDeptName(day.deptName);
        record.setGroupId(group.getId());
        record.setGroupName(group.getGroupName());
        record.setWorkDate(date);
        record.setExceptionType(type);
        record.setDetail(detail);
        record.setLateMinutes(lateMinutes);
        record.setStatus(AttException.STATUS_PENDING);
        record.setCreatedBy(operator);
        record.setUpdatedBy(operator);
        exceptionMapper.insert(record);
        return 1;
    }

    private AttMonthlySummary aggregateMonth(Long userId, String month, List<PersonalDay> days,
                                             AttMonthlySummary existing) {
        AttMonthlySummary row = existing != null ? existing : new AttMonthlySummary();
        row.setStatMonth(month);
        row.setUserId(userId);
        PersonalDay first = days.get(0);
        row.setEmpNo(first.empNo);
        row.setEmpName(first.empName);
        row.setDeptId(first.deptId);
        row.setDeptName(first.deptName);
        row.setShouldDays(sum(days, d -> d.shouldAttend ? BigDecimal.ONE : BigDecimal.ZERO));
        row.setActualDays(sum(days, d -> d.attended ? BigDecimal.ONE : BigDecimal.ZERO));
        row.setLateTimes((int) days.stream().filter(d -> d.lateMinutes > 0).count());
        row.setLateMinutes(days.stream().mapToInt(d -> d.lateMinutes).sum());
        row.setEarlyTimes((int) days.stream().filter(d -> d.earlyMinutes > 0).count());
        row.setMissingTimes((int) days.stream().filter(d -> d.missingCard).count());
        row.setAbsentDays(sum(days, d -> d.absent ? BigDecimal.ONE : BigDecimal.ZERO));
        row.setAnnualDays(BigDecimal.ZERO);
        row.setSickDays(BigDecimal.ZERO);
        row.setPersonalDays(BigDecimal.ZERO);
        row.setWorkdayOtHours(overtimeByKind(days, OT_WORKDAY));
        row.setRestdayOtHours(overtimeByKind(days, OT_RESTDAY));
        row.setHolidayOtHours(overtimeByKind(days, OT_HOLIDAY));
        BigDecimal should = row.getShouldDays();
        row.setAttendRate(should.signum() == 0 ? BigDecimal.ZERO
                : row.getActualDays().multiply(BigDecimal.valueOf(100)).divide(should, 2, RoundingMode.HALF_UP));
        if (existing == null) {
            row.setStatus(AttMonthlySummary.STATUS_DRAFT);
        }
        return row;
    }

    private BigDecimal sum(List<PersonalDay> days, java.util.function.Function<PersonalDay, BigDecimal> getter) {
        return days.stream().map(getter).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(1, RoundingMode.HALF_UP);
    }

    private BigDecimal overtimeByKind(List<PersonalDay> days, int kind) {
        return days.stream().filter(d -> d.overtimeKind == kind).map(d -> d.overtime)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(1, RoundingMode.HALF_UP);
    }

    private Map<String, Object> transition(List<Long> ids, String from, String to, boolean assignBatch) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException("請至少選擇一條記錄");
        }
        String operator = operatorResolver.currentOperatorName();
        LocalDate now = LocalDate.now();
        int changed = 0;
        int skipped = 0;
        String batchNo = null;
        for (Long id : ids) {
            AttMonthlySummary row = monthlyMapper.selectById(id);
            if (row == null || !from.equals(row.getStatus())) {
                skipped++;
                continue;
            }
            if (assignBatch) {
                // 同一批冻结共用一个批次号，薪酬侧按批次对账；跨月时按月各取一号
                String key = row.getStatMonth();
                if (batchNo == null || !batchNo.startsWith("AT" + key.replace("-", ""))) {
                    batchNo = bizSeqService.next(BizSeqService.RULE_ATTENDANCE_MONTHLY_BATCH, now);
                }
                row.setBatchNo(batchNo);
                row.setFrozenBy(operator);
                row.setFrozenAt(LocalDateTime.now());
            } else {
                row.setSyncedAt(LocalDateTime.now());
            }
            row.setStatus(to);
            row.setUpdatedBy(operator);
            monthlyMapper.updateById(row);
            changed++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("changed", changed);
        result.put("skipped", skipped);
        result.put("batchNo", batchNo == null ? "" : batchNo);
        return result;
    }

    /* ==================== 查询条件与工具 ==================== */

    private LambdaQueryWrapper<AttDaySummary> dailyFilter(LocalDate from, LocalDate to, Long groupId, Long deptId) {
        LambdaQueryWrapper<AttDaySummary> wrapper = new LambdaQueryWrapper<>();
        if (from != null) {
            wrapper.ge(AttDaySummary::getWorkDate, from);
        }
        if (to != null) {
            wrapper.le(AttDaySummary::getWorkDate, to);
        }
        if (groupId != null) {
            wrapper.eq(AttDaySummary::getGroupId, groupId);
        }
        if (deptId != null) {
            wrapper.eq(AttDaySummary::getDeptId, deptId);
        }
        return wrapper;
    }

    private LambdaQueryWrapper<AttMonthlySummary> monthlyFilter(String month, Long groupId, Long deptId,
                                                                String keyword, String status) {
        LambdaQueryWrapper<AttMonthlySummary> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(month)) {
            wrapper.eq(AttMonthlySummary::getStatMonth, month.trim());
        }
        if (groupId != null) {
            wrapper.eq(AttMonthlySummary::getGroupId, groupId);
        }
        if (deptId != null) {
            wrapper.eq(AttMonthlySummary::getDeptId, deptId);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(AttMonthlySummary::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(AttMonthlySummary::getEmpNo, kw).or().like(AttMonthlySummary::getEmpName, kw));
        }
        return wrapper;
    }

    private List<AttGroup> targetGroups(Long groupId) {
        if (groupId != null) {
            AttGroup group = groupMapper.selectById(groupId);
            if (group == null) {
                throw new BusinessException("考勤組不存在或已刪除");
            }
            return List.of(group);
        }
        return groupMapper.selectList(new LambdaQueryWrapper<AttGroup>().eq(AttGroup::getStatus, STATUS_ENABLED));
    }

    /** 已冻结/已同步的月份集合：重算与重生成都必须整体跳过 */
    private Set<String> frozenMonths() {
        return monthlyMapper.selectList(new LambdaQueryWrapper<AttMonthlySummary>()
                        .in(AttMonthlySummary::getStatus, AttMonthlySummary.STATUS_FROZEN, AttMonthlySummary.STATUS_SYNCED)
                        .select(AttMonthlySummary::getStatMonth))
                .stream().map(AttMonthlySummary::getStatMonth).filter(StringUtils::hasText).collect(Collectors.toSet());
    }

    private static YearMonth parseMonth(String month) {
        if (!StringUtils.hasText(month)) {
            throw new BusinessException("請選擇月份");
        }
        try {
            return YearMonth.parse(month.trim());
        } catch (RuntimeException e) {
            throw new BusinessException("月份格式應為 yyyy-MM");
        }
    }

    private static int nullToZero(Integer value) {
        return value == null ? 0 : value;
    }

    private static BigDecimal decimal(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}

/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmWorklogDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.entity.CpmWorklogGroup;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmWorklogGroupMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 台账汇报聚合（服务端确定性口径）。
 *
 * <p>为什么把这套算法从前端搬进来：汇报页、Markdown 导出、钉钉推送必须给同一个数字，
 * 而浏览器里算出的那份只存在于当前标签页，其他出口拿不到它。
 * 「页面数字 = 通知数字」是汇报域的铁律，唯一实现只能放在服务端。
 *
 * <p>四条口径（单测 {@code CpmWorklogReportServiceTest} 逐条钉住）：
 * 1) 期初/期末取进度流水快照，不取当前值——当前值会随用户事后手改漂移；
 * 2) 完成时点取流水首次 ≥100，没有流水时如实取计划止日；
 * 3) 区间工时取交集工作日 × 8h，跨周任务不把整段算进本期；
 * 4) 下期计划从全量条目取，不从「与本期相交的行」里筛——后者与 start &gt; 期末 互斥，恒为空集。
 *
 * <p>未分组条目（旧的日报流水）同样参与聚合：把它们排除在外会让周报少掉真实做过的事。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmWorklogReportService {

    /** 流水回溯窗口：期初快照要能看到本期开始之前最后一笔进度，否则跨周任务一律显示 0% */
    private static final int TRAIL_BACK_DAYS = 400;

    private final CpmItemMapper itemMapper;
    private final CpmItemUpdateMapper updateMapper;
    private final CpmWorklogGroupMapper groupMapper;
    private final CpmWorkdays workdays;
    private final CpmPeriods periods;
    private final CpmAccessGuard guard;

    /**
     * 按周期聚合台账。
     *
     * @param periodType day/week/month/quarter（day 只作查看档，不落发布实体）
     * @param startStr   周期内任一日期；服务端归一到所属周期起点
     */
    public CpmWorklogDto.ReportVO report(String periodType, String startStr) {
        SysUser current = guard.currentUser();
        long userId = current.getId();
        LocalDate today = periods.today();
        CpmPeriods.Period period = periods.resolve(periodType, parseDate(startStr, today));
        LocalDate from = period.start();
        LocalDate to = period.end();

        CpmWorkdays.Ledger calendar = workdays.load(userId, from.minusDays(TRAIL_BACK_DAYS), today);
        Map<Long, List<CpmItemUpdate>> trails = new LinkedHashMap<>();
        for (CpmItemUpdate row : updateMapper.listByUserAndRange(userId, from.minusDays(TRAIL_BACK_DAYS), to)) {
            trails.computeIfAbsent(row.getItemId(), k -> new ArrayList<>()).add(row);
        }
        List<CpmItem> all = itemMapper.listLedger(userId);
        Map<Long, CpmWorklogGroup> groups = new LinkedHashMap<>();
        for (CpmWorklogGroup group : groupMapper.listMine(userId)) {
            groups.put(group.getId(), group);
        }

        CpmWorklogDto.ReportVO vo = new CpmWorklogDto.ReportVO();
        vo.setPeriodType(period.periodType());
        vo.setStart(from.toString());
        vo.setEnd(to.toString());

        List<CpmWorklogDto.ReportRowVO> rows = new ArrayList<>();
        int backlog = 0;
        int cancelled = 0;
        for (CpmItem item : all) {
            // 已取消不进本期內容、风险、备注、下期计划与工时：一场被取消的会没有可汇报的产出，
            // 留在汇报里只会拉低平均进度、抬高总工时，让周会念出一堆本来就不存在的事
            if (CpmConstants.STATUS_CANCELLED.equals(item.getStatus())) {
                cancelled++;
                continue;
            }
            if (item.getPlanStart() == null || item.getPlanEnd() == null) {
                backlog++;
                continue;
            }
            if (item.getPlanStart().isAfter(to) || item.getPlanEnd().isBefore(from)) {
                continue;
            }
            rows.add(toRow(item, groups, trails.getOrDefault(item.getId(), List.of()), calendar, from, to, today));
        }
        vo.setRisks(rows.stream().filter(r -> r.getOverdueDays() > 0).toList());
        vo.setNotes(rows.stream().filter(r -> r.getNote() != null && !r.getNote().isBlank()).toList());
        vo.setInsertedRows(rows.stream().filter(r -> CpmConstants.PLAN_TYPE_INSERTED.equals(r.getPlanType())
                && inRange(r.getInsertedAt() == null ? r.getStart() : r.getInsertedAt(), from, to)).toList());
        vo.setFollowUps(rows.stream().filter(CpmWorklogDto.ReportRowVO::isFollowUp).toList());
        vo.setBlockedRows(rows.stream().filter(CpmWorklogDto.ReportRowVO::isBlocked).toList());
        vo.setPlan(planRows(all, groups, trails, calendar, from, to, today));

        vo.setGroups(groupRows(rows, groups));
        vo.setDaily(daily(rows, calendar, from, to, vo));
        fillTotals(vo, rows, backlog, cancelled);
        return vo;
    }

    /* ==================== 内部 ==================== */

    private CpmWorklogDto.ReportRowVO toRow(CpmItem item, Map<Long, CpmWorklogGroup> groups,
                                            List<CpmItemUpdate> trail, CpmWorkdays.Ledger calendar,
                                            LocalDate from, LocalDate to, LocalDate today) {
        CpmWorklogDto.ReportRowVO row = new CpmWorklogDto.ReportRowVO();
        row.setTaskId(item.getId());
        row.setGroupId(item.getGroupId());
        row.setTitle(item.getTitle());
        row.setGroupTitle(groupTitle(item.getGroupId(), groups));
        row.setStart(item.getPlanStart().toString());
        row.setEnd(item.getPlanEnd().toString());
        row.setPStart(progressAt(trail, item, from));
        row.setPEnd(progressAt(trail, item, to));
        row.setDelta(row.getPEnd() - row.getPStart());
        row.setHours(hoursOfRow(item, calendar, from, to));
        /* 加班拆分与台账耗时列同一派生（合计减交集工作日 × 8h）：两边用不同区间算就
           会出现「页面 20h 含 4h 加班、周报 20h 全算正常」这种各自都对但互相打脸 */
        row.setOvertimeHours(CpmWorkdays.overtimeHoursOf(row.getHours(), periodWorkdays(item, calendar, from, to)));
        String doneAt = doneAt(trail, item);
        row.setDoneAt(doneAt != null && inRange(doneAt, from, to) ? doneAt : null);
        row.setOverdueDays(item.getPlanEnd().isBefore(today) && value(item.getProgress()) < 100
                ? (int) ChronoUnit.DAYS.between(item.getPlanEnd(), today) : 0);
        row.setPlanType(item.getPlanType() == null ? CpmConstants.PLAN_TYPE_PLANNED : item.getPlanType());
        row.setInsertedAt(item.getInsertedAt() == null ? null : item.getInsertedAt().toString());
        row.setFollowUp(item.getFollowUp() != null && item.getFollowUp() == 1);
        row.setBlocked(item.getBlocked() != null && item.getBlocked() == 1);
        row.setBlockedReason(item.getBlockedReason());
        row.setCancelReason(item.getCancelReason());
        row.setNote(item.getNoteText() == null ? "" : item.getNoteText());
        row.setState(stateOf(item));
        return row;
    }

    /**
     * 某日进度：取流水最后一笔 ≤ date。
     *
     * <p>无流水时按存量兜底：计划开始日之前算 0，之后算当前进度——存量条目本来就没有轨迹，
     * 编一个期初数字会让「本期推进」变成凭空产出。
     */
    static int progressAt(List<CpmItemUpdate> trail, CpmItem item, LocalDate date) {
        return CpmProgressSnapshots.at(CpmProgressSnapshots.ofUpdates(trail), item, date);
    }

    /** 完成时点：流水首次 ≥100；没有流水的存量数据如实取计划止日 */
    static String doneAt(List<CpmItemUpdate> trail, CpmItem item) {
        if (value(item.getProgress()) < 100) {
            return null;
        }
        for (CpmItemUpdate row : trail) {
            if (value(row.getProgress()) >= 100) {
                return row.getUpdateDate().toString();
            }
        }
        return item.getPlanEnd() == null ? null : item.getPlanEnd().toString();
    }

    /**
     * 下期计划：从全量条目取，且只取「本期之后、不超过一个周期长度」的排期。
     *
     * <p>上限的存在是为了让周汇报只念下周、月汇报只念下月；不设限会把三个月后的
     * 排期塞进周报，读者会以为那是本周承诺。
     */
    private List<CpmWorklogDto.ReportRowVO> planRows(List<CpmItem> all, Map<Long, CpmWorklogGroup> groups,
                                                     Map<Long, List<CpmItemUpdate>> trails,
                                                     CpmWorkdays.Ledger calendar, LocalDate from, LocalDate to,
                                                     LocalDate today) {
        int periodLen = (int) ChronoUnit.DAYS.between(from, to) + 1;
        List<CpmWorklogDto.ReportRowVO> plan = new ArrayList<>();
        for (CpmItem item : all) {
            if (CpmConstants.STATUS_CANCELLED.equals(item.getStatus())) {
                continue;
            }
            if (item.getPlanStart() == null || !item.getPlanStart().isAfter(to)) {
                continue;
            }
            if (ChronoUnit.DAYS.between(to, item.getPlanStart()) > periodLen) {
                continue;
            }
            plan.add(toRow(item, groups, trails.getOrDefault(item.getId(), List.of()), calendar, from, to, today));
        }
        plan.sort(Comparator.comparing(CpmWorklogDto.ReportRowVO::getStart));
        return plan;
    }

    /** 按工作項汇总：工时降序，因为汇报读者先关心「这周的钱花在哪几条主线上」 */
    private List<CpmWorklogDto.ReportGroupVO> groupRows(List<CpmWorklogDto.ReportRowVO> rows,
                                                        Map<Long, CpmWorklogGroup> groups) {
        Map<Long, List<CpmWorklogDto.ReportRowVO>> byGroup = new LinkedHashMap<>();
        for (CpmWorklogDto.ReportRowVO row : rows) {
            byGroup.computeIfAbsent(row.getGroupId() == null ? CpmWorklogService.UNGROUPED_ID : row.getGroupId(),
                    k -> new ArrayList<>()).add(row);
        }
        List<CpmWorklogDto.ReportGroupVO> out = new ArrayList<>();
        for (Map.Entry<Long, List<CpmWorklogDto.ReportRowVO>> entry : byGroup.entrySet()) {
            List<CpmWorklogDto.ReportRowVO> groupRows = entry.getValue();
            CpmWorklogGroup group = groups.get(entry.getKey());
            CpmWorklogDto.ReportGroupVO vo = new CpmWorklogDto.ReportGroupVO();
            vo.setGroupId(entry.getKey());
            vo.setTitle(group == null ? null : group.getTitle());
            vo.setHue(group == null || group.getHue() == null ? 0 : group.getHue());
            vo.setRows(new ArrayList<>(groupRows));
            vo.setHours(groupRows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getHours).sum());
            vo.setOvertimeHours(groupRows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getOvertimeHours).sum());
            vo.setAvgStart(round(groupRows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getPStart).average().orElse(0)));
            vo.setAvgEnd(round(groupRows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getPEnd).average().orElse(0)));
            vo.setDoneCount((int) groupRows.stream().filter(r -> r.getDoneAt() != null).count());
            out.add(vo);
        }
        out.sort(Comparator.comparingInt(CpmWorklogDto.ReportGroupVO::getHours).reversed());
        return out;
    }

    /**
     * 每日投入：把每行的本期工时按它在本期占的几个工作日均摊到每一天。
     *
     * <p>这里用排期而不是时段表：汇报页的工时与甘特色条必须同源，否则用户会看到
     * 「色条铺满五天、每日柱状图只有两天」这种两边都算对却互相打脸的画面。
     *
     * <p>为什么改为均摊而不是直接 × 8h：手工耗时上线后，一行可能就是 3h 或 12h，
     * 写死 8h 会让每日柱状图加起来不等于顶部总工时，而这两个数字在同一屏上。
     * 均摊保持了旧口径下的恒等式（无手工值时每行每天恰好还是 8h），
     * 而手工值本质上就是一个均匀假设——它本来就没被量过。
     */
    private List<CpmWorklogDto.ReportDayVO> daily(List<CpmWorklogDto.ReportRowVO> rows,
                                                  CpmWorkdays.Ledger calendar, LocalDate from, LocalDate to,
                                                  CpmWorklogDto.ReportVO vo) {
        List<CpmWorklogDto.ReportDayVO> out = new ArrayList<>();
        for (LocalDate cur = from; !cur.isAfter(to); cur = cur.plusDays(1)) {
            boolean rest = calendar.isRestDay(cur);
            int hours = 0;
            if (!rest) {
                String key = cur.toString();
                for (CpmWorklogDto.ReportRowVO row : rows) {
                    if (row.getStart().compareTo(key) > 0 || row.getEnd().compareTo(key) < 0) {
                        continue;
                    }
                    hours += perDayHours(row, calendar, from, to);
                }
            }
            CpmWorklogDto.ReportDayVO day = new CpmWorklogDto.ReportDayVO(key0(cur), hours, rest);
            out.add(day);
            if (hours > 0 && (vo.getPeak() == null || hours > vo.getPeak().getHours())) {
                vo.setPeak(day);
            }
        }
        return out;
    }

    /**
     * 一行落在某一天的工时：本期工时 ÷ 本期交集工作日，除不尽时把余数给首日。
     *
     * <p>余数不能丢也不四舍五入：逐日四舍五入后加起来会与顶部总工时差 1h，
     * 而那种差值永远需要有人来解释。首日多一分，两边就永远相等。
     * <p>交集工作日为 0（区间内全是休息日）时归零：宁可不摊，也不除出 Infinity 或堆到区间外。
     */
    private int perDayHours(CpmWorklogDto.ReportRowVO row, CpmWorkdays.Ledger calendar,
                            LocalDate from, LocalDate to) {
        if (row.getHours() <= 0) {
            return 0;
        }
        LocalDate start = maxDate(LocalDate.parse(row.getStart()), from);
        LocalDate end = minDate(LocalDate.parse(row.getEnd()), to);
        long days = calendar.workdays(start, end);
        if (days <= 0) {
            return 0;
        }
        int base = (int) (row.getHours() / days);
        return base + (int) (row.getHours() % days);
    }

    private static LocalDate maxDate(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate minDate(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }

    private static String key0(LocalDate date) {
        return date.toString();
    }

    private void fillTotals(CpmWorklogDto.ReportVO vo, List<CpmWorklogDto.ReportRowVO> rows, int backlog, int cancelled) {
        CpmWorklogDto.TotalsVO t = vo.getTotals();
        t.setTotal(rows.size());
        t.setCancelled(cancelled);
        t.setDone((int) rows.stream().filter(r -> r.getDoneAt() != null).count());
        t.setDoing((int) rows.stream().filter(r -> r.getPEnd() > 0 && r.getPEnd() < 100).count());
        t.setPending((int) rows.stream().filter(r -> r.getPEnd() == 0).count());
        t.setInserted(vo.getInsertedRows().size());
        t.setFollowUpCount(vo.getFollowUps().size());
        t.setFollowUpAvg(round(vo.getFollowUps().stream().mapToInt(CpmWorklogDto.ReportRowVO::getPEnd).average().orElse(0)));
        t.setBlockedCount(vo.getBlockedRows().size());
        t.setRisks(vo.getRisks().size());
        t.setBacklog(backlog);
        t.setHours(rows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getHours).sum());
        t.setOvertimeHours(rows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getOvertimeHours).sum());
        t.setAvgStart(round(rows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getPStart).average().orElse(0)));
        t.setAvgEnd(round(rows.stream().mapToInt(CpmWorklogDto.ReportRowVO::getPEnd).average().orElse(0)));
        // 概览卡的「期末平均进度」与统计口径同源：两处各算一次就会出现卡片与明细不一致
        t.setAvgProgress(t.getAvgEnd());
    }

    private static String groupTitle(Long groupId, Map<Long, CpmWorklogGroup> groups) {
        if (groupId == null) {
            return null;
        }
        CpmWorklogGroup group = groups.get(groupId);
        return group == null ? null : group.getTitle();
    }

    private static String stateOf(CpmItem item) {
        int progress = value(item.getProgress());
        if (CpmConstants.STATUS_CANCELLED.equals(item.getStatus())) {
            return CpmConstants.STATUS_CANCELLED;
        }
        if (progress >= 100) {
            return CpmConstants.STATUS_DONE;
        }
        if (item.getPlanStart() == null) {
            return "plan";
        }
        return progress > 0 ? CpmConstants.STATUS_DOING : CpmConstants.STATUS_TODO;
    }

    /**
     * 交集工作日数：与 {@code hoursOfRow} 同一条区间口径。
     *
     * <p>加班量是「合计 − 交集工作日 × 8h」。拿整段工作日去减本期工时，
     * 一场跳月的任务会被算出一堆根本不存在的加班（工时被本期截断，额度却没截）。
     */
    private static int periodWorkdays(CpmItem item, CpmWorkdays.Ledger calendar, LocalDate from, LocalDate to) {
        LocalDate start = item.getPlanStart();
        LocalDate end = item.getPlanEnd();
        if (start == null || end == null) {
            return 0;
        }
        LocalDate s = start.isAfter(from) ? start : from;
        LocalDate e = end.isBefore(to) ? end : to;
        return e.isBefore(s) ? 0 : calendar.workdays(s, e);
    }

    /**
     * 本期工时：手工覆盖优先，否则取交集工作日 × 8h。
     *
     * <p>与台账列必须用同一个判据（只有 source=manual 才算覆盖）：一边算打卡合计、
     * 一边算计划值，就会出现「页面 12h、推送 8h」——工时决定汇报数字与推送内容，
     * 两处各算一次是本域从一开始就断掉的那条错。
     * <p>手工值不拆到周期：把 12h 按工作日比例劈成「本周 4.3h」是编出来的数字，
     * 有覆盖值时只在与本周期相交时整笔计入。
     */
    private int hoursOfRow(CpmItem item, CpmWorkdays.Ledger calendar, LocalDate from, LocalDate to) {
        java.math.BigDecimal manual = CpmWorklogService.manualHoursOf(item);
        if (manual == null) {
            return calendar.hoursInPeriod(item.getPlanStart(), item.getPlanEnd(), from, to);
        }
        boolean overlaps = !item.getPlanEnd().isBefore(from) && !item.getPlanStart().isAfter(to);
        return overlaps ? manual.setScale(0, java.math.RoundingMode.HALF_UP).intValue() : 0;
    }

    private static boolean inRange(String date, LocalDate from, LocalDate to) {
        if (date == null) {
            return false;
        }
        try {
            LocalDate parsed = LocalDate.parse(date);
            return !parsed.isBefore(from) && !parsed.isAfter(to);
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static int value(Integer value) {
        return value == null ? 0 : value;
    }

    private static int round(double value) {
        return (int) Math.round(value);
    }

    private static LocalDate parseDate(String value, LocalDate fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(value.trim().substring(0, Math.min(10, value.trim().length())));
        } catch (DateTimeParseException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }
}

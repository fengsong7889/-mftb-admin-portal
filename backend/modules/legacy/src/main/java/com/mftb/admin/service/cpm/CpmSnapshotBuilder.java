/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.entity.CpmTimeEntry;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmTimeEntryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 确定性聚合器：周期 → 汇报快照（预览与发布共用同一函数）。
 *
 * <p>不可让第 2 处实现存在的理由（口径单点，同 RdmDailyReportService）：
 * 「用户在生成页看到的数字」与「上级收到的快照数字」一旦分叉，汇报就变成了罗生门。
 *
 * <p>四条收敛规则（前三条阶段二既有，第四条阶段三追加）：
 * 1) 按 itemId 去重——同一长期事项期间更新 4 次也只算 1 项；
 * 2) 期末状态取「期间内最后一条流水」（同日多条取后写的 id），无流水回退条目缓存；
 * 3) 轨迹保留期间内每日百分比序列，报告页展示 30% → 70%，不改写任何数字；
 * 4) <b>工时从同一批明细行算</b>：分类占比、每日趋势、事项投入 Top N 全部由已取回的
 *    {@code biz_cpm_time_entry} 行汇总，不再另发一条聚合 SQL——两处 WHERE 迟早会漂，
 *    漂了就是「明细加起来不等于总数」，而没人会去查两处条件的差异。
 *
 * <p>工时与评价之间没有通路：本类不输出任何跨人比较口径（方案反内卷红线）。
 */
@Component
@RequiredArgsConstructor
public class CpmSnapshotBuilder {

    /** 事项投入成本展示条数：再多就没人看，且界面按条形排序会挤成一片 */
    private static final int TOP_ITEM_LIMIT = 5;

    private final CpmItemMapper itemMapper;
    private final CpmItemUpdateMapper updateMapper;
    private final CpmTimeEntryMapper timeMapper;
    private final CpmItemService itemService;

    public CpmDto.Snapshot build(long userId, String periodType, LocalDate start, LocalDate end) {
        Map<String, String> labels = itemService.categoryLabels();
        CpmDto.Snapshot snapshot = new CpmDto.Snapshot();
        snapshot.setPeriodType(periodType);
        snapshot.setPeriodStart(start.toString());
        snapshot.setPeriodEnd(end.toString());

        List<Long> activeIds = updateMapper.listActiveItemIds(userId, start, end);
        if (activeIds.isEmpty()) {
            snapshot.setTime(emptyTime());
            return snapshot;
        }
        List<CpmItem> items = itemMapper.selectBatchIds(activeIds).stream()
                .filter(i -> i.getDeleted() == null || i.getDeleted() == 0)
                .toList();
        Map<Long, List<CpmItemUpdate>> updatesByItem = new LinkedHashMap<>();
        for (CpmItemUpdate u : updateMapper.listByUserAndRange(userId, start, end)) {
            updatesByItem.computeIfAbsent(u.getItemId(), k -> new ArrayList<>()).add(u);
        }
        // 一次取全期间时段：明细行同时供「每条目分钟/区间」与「分类/每日/Top N」两种汇总使用
        List<CpmTimeEntry> segments = timeMapper.listByUserAndRange(userId, start, end);
        Map<Long, List<CpmTimeEntry>> segmentsByItem = new LinkedHashMap<>();
        segments.forEach(segment -> segmentsByItem
                .computeIfAbsent(segment.getItemId(), k -> new ArrayList<>()).add(segment));

        Map<String, CpmDto.Snapshot.Group> groups = new LinkedHashMap<>();
        CpmDto.Snapshot.Totals totals = snapshot.getTotals();
        for (CpmItem item : items) {
            List<CpmItemUpdate> trail = updatesByItem.getOrDefault(item.getId(), List.of());
            CpmDto.Snapshot.Entry entry = new CpmDto.Snapshot.Entry();
            entry.setItemId(item.getId());
            entry.setTitle(item.getTitle());
            entry.setWorkDate(item.getWorkDate() == null ? null : item.getWorkDate().toString());
            entry.setSourceType(item.getSourceType());
            entry.setSourceLabel(item.getSourceLabel());
            if (trail.isEmpty()) {
                // 无流水：回退条目缓存（历史数据/异常兜底；正常路径首条流水与条目同事务写入）
                entry.setStatus(item.getStatus());
                entry.setProgress(item.getProgress());
            } else {
                CpmItemUpdate last = trail.get(trail.size() - 1);
                entry.setStatus(last.getStatus());
                entry.setProgress(last.getProgress());
                trail.forEach(u -> entry.getTrail().add(u.getProgress()));
            }
            applyEntryMinutes(entry, item, segmentsByItem.getOrDefault(item.getId(), List.of()));
            countStatus(totals, entry.getStatus());
            CpmDto.Snapshot.Group group = groups.computeIfAbsent(nullSafe(item.getCategory()), k -> {
                CpmDto.Snapshot.Group g = new CpmDto.Snapshot.Group();
                g.setCategory(k);
                g.setCategoryLabel(labels.getOrDefault(k, k));
                return g;
            });
            group.getItems().add(entry);
        }
        totals.setTotal(items.size());
        List<CpmDto.Snapshot.Group> groupList = new ArrayList<>(groups.values());
        groupList.forEach(g -> g.setMinutes(g.getItems().stream()
                .mapToInt(e -> e.getMinutes() == null ? 0 : e.getMinutes()).sum()));
        snapshot.setGroups(groupList);
        snapshot.setTime(buildTime(groupList, segments));
        return snapshot;
    }

    /**
     * 条目工时：精确时段优先，无时段才回退手工工时。
     *
     * <p>两种来源绝不相加——同一次投入如果既填了手工工时又记了时段，相加就是把一小时算成两小时。
     * 回退到手工值时把 {@code minutesSource} 标成 manual，让界面能说清这个数字的精度低一档。
     */
    private void applyEntryMinutes(CpmDto.Snapshot.Entry entry, CpmItem item, List<CpmTimeEntry> own) {
        int precise = own.stream().mapToInt(CpmTimeEntry::getDurationMinutes).sum();
        own.stream()
                .sorted((a, b) -> Integer.compare(sortKey(a), sortKey(b)))
                .forEach(segment -> entry.getSegments().add(toSegment(segment)));
        if (precise > 0) {
            entry.setMinutes(precise);
            entry.setMinutesSource("segment");
            return;
        }
        BigDecimal manual = item.getWorkHours();
        if (manual != null && manual.signum() > 0) {
            entry.setMinutes(manual.multiply(BigDecimal.valueOf(60)).setScale(0, RoundingMode.HALF_UP).intValue());
            entry.setMinutesSource("manual");
            return;
        }
        // 两者都没有：留 null 而不是 0。0 会被读成「这件事没花时间」，null 才是「没记录」
        entry.setMinutes(null);
        entry.setMinutesSource("none");
    }

    /** 同一天内按开始时刻排序，未填时刻的排在后面（null 参与比较最容易写出 NPE） */
    private static int sortKey(CpmTimeEntry entry) {
        return entry.getStartTime() == null ? Integer.MAX_VALUE : entry.getStartTime().toSecondOfDay();
    }

    private static CpmDto.Snapshot.Segment toSegment(CpmTimeEntry entry) {
        CpmDto.Snapshot.Segment segment = new CpmDto.Snapshot.Segment();
        segment.setWorkDate(entry.getWorkDate() == null ? null : entry.getWorkDate().toString());
        segment.setStartTime(clock(entry.getStartTime()));
        segment.setEndTime(clock(entry.getEndTime()));
        segment.setCrossesMidnight(Integer.valueOf(1).equals(entry.getCrossesMidnight()));
        segment.setDurationMinutes(entry.getDurationMinutes());
        segment.setNote(entry.getNote());
        return segment;
    }

    private static String clock(java.time.LocalTime time) {
        return time == null ? null : String.format("%02d:%02d", time.getHour(), time.getMinute());
    }

    /**
     * 工时汇总：分类占比 / 每日趋势 / 事项 Top N / 日均。
     *
     * <p>日均分母是<b>有投入的天数</b>而不是周期自然天数。这条口径值得单独强调：
     * 用自然天数算出来的「日均 2.1h」在包含两个周末的一周里，实际上说的是
     * 「我在工作日里平均每天投了多少」——但它把休息日算进了分母，等于替用户谦虚了一次。
     * 报表里的谦虚和撒谎只差一个分母。
     */
    private CpmDto.Snapshot.TimeTotals buildTime(List<CpmDto.Snapshot.Group> groups, List<CpmTimeEntry> segments) {
        CpmDto.Snapshot.TimeTotals time = emptyTime();
        int precise = segments.stream().mapToInt(CpmTimeEntry::getDurationMinutes).sum();

        Map<String, long[]> byCategoryMinutes = new LinkedHashMap<>();
        Map<String, String> byCategoryLabel = new LinkedHashMap<>();
        Map<String, Integer> byDay = new LinkedHashMap<>();
        Map<Long, Integer> byItem = new LinkedHashMap<>();
        Map<Long, String> entryTitles = new LinkedHashMap<>();
        int manualFallback = 0;
        for (CpmDto.Snapshot.Group group : groups) {
            for (CpmDto.Snapshot.Entry entry : group.getItems()) {
                entryTitles.put(entry.getItemId(), entry.getTitle());
                Integer minutes = entry.getMinutes();
                if (minutes == null || minutes <= 0) {
                    continue;
                }
                if ("manual".equals(entry.getMinutesSource())) {
                    manualFallback += minutes;
                }
                // 分类按 code 归并、label 随行带出：用 label 当键会让两个同名分类直接合并成一桶
                byCategoryMinutes.computeIfAbsent(group.getCategory(), k -> new long[1])[0] += minutes;
                byCategoryLabel.putIfAbsent(group.getCategory(), group.getCategoryLabel());
                byItem.merge(entry.getItemId(), minutes, Integer::sum);
            }
        }
        segments.forEach(segment -> byDay.merge(segment.getWorkDate().toString(),
                segment.getDurationMinutes(), Integer::sum));

        int total = precise + manualFallback;
        time.setPreciseMinutes(precise);
        time.setManualFallbackMinutes(manualFallback);
        time.setTotalMinutes(total);
        time.setActiveDays(byDay.size());
        time.setAvgMinutesPerActiveDay(byDay.isEmpty() ? 0 : Math.round((float) total / byDay.size()));

        List<Map.Entry<String, Integer>> days = new ArrayList<>(byDay.entrySet());
        days.sort(Map.Entry.comparingByKey());
        days.forEach(e -> {
            CpmDto.TimeByDay row = new CpmDto.TimeByDay();
            row.setWorkDate(e.getKey());
            row.setMinutes((long) e.getValue());
            time.getByDay().add(row);
        });
        if (!days.isEmpty()) {
            Map.Entry<String, Integer> peak = days.stream()
                    .max(Map.Entry.comparingByValue()).orElseThrow();
            time.setPeakDate(peak.getKey());
            time.setPeakMinutes(peak.getValue());
        }

        byCategoryMinutes.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]))
                .forEach(e -> {
                    CpmDto.TimeByCategory row = new CpmDto.TimeByCategory();
                    row.setCategory(e.getKey());
                    row.setCategoryLabel(byCategoryLabel.get(e.getKey()));
                    row.setMinutes(e.getValue()[0]);
                    time.getByCategory().add(row);
                });
        byItem.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(TOP_ITEM_LIMIT)
                .forEach(e -> {
                    CpmDto.TimeByItem row = new CpmDto.TimeByItem();
                    row.setItemId(e.getKey());
                    row.setTitle(entryTitles.get(e.getKey()));
                    row.setMinutes((long) e.getValue());
                    time.getTopItems().add(row);
                });
        return time;
    }

    private static CpmDto.Snapshot.TimeTotals emptyTime() {
        // peakDate/peakMinutes 留 null：没有投入时给「峰值 0 分钟」是把缺失误报成测量结果
        return new CpmDto.Snapshot.TimeTotals();
    }

    private static void countStatus(CpmDto.Snapshot.Totals totals, String status) {
        switch (status == null ? "" : status) {
            case CpmConstants.STATUS_DONE -> totals.setDone(totals.getDone() + 1);
            case CpmConstants.STATUS_DOING -> totals.setDoing(totals.getDoing() + 1);
            case CpmConstants.STATUS_TODO -> totals.setTodo(totals.getTodo() + 1);
            case CpmConstants.STATUS_BLOCKED -> totals.setBlocked(totals.getBlocked() + 1);
            case CpmConstants.STATUS_DEFERRED -> totals.setDeferred(totals.getDeferred() + 1);
            case CpmConstants.STATUS_CANCELLED -> totals.setCancelled(totals.getCancelled() + 1);
            // 未知状态不进任何分桶，但 total 仍按条目数收口：口径差异要如实暴露而不是被悄悄抹平
            default -> { }
        }
    }

    private static String nullSafe(String value) {
        return value == null || value.isBlank() ? "general" : value;
    }
}

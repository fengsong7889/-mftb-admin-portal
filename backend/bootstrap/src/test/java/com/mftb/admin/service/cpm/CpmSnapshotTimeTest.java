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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 快照的工时维度测试（阶段三新增口径）。
 *
 * <p>这里钉的全是「数字怎么算」而不是「字段有没有」：日均分母、精确与估算分列、
 * 不编造零值日、Top N 截断、六值状态分桶。每一条一旦被改动，汇报里就会出现
 * 「同一个周期两种说法」，而那种差异在界面上看起来完全正常。
 */
class CpmSnapshotTimeTest {

    private static final long USER = 1L;
    private static final LocalDate START = LocalDate.of(2026, 11, 16);
    private static final LocalDate END = LocalDate.of(2026, 11, 22);

    private CpmItemMapper itemMapper;
    private CpmItemUpdateMapper updateMapper;
    private CpmTimeEntryMapper timeMapper;
    private CpmItemService itemService;
    private CpmSnapshotBuilder builder;

    @BeforeEach
    void setUp() {
        itemMapper = mock(CpmItemMapper.class);
        updateMapper = mock(CpmItemUpdateMapper.class);
        timeMapper = mock(CpmTimeEntryMapper.class);
        itemService = mock(CpmItemService.class);
        when(itemService.categoryLabels()).thenReturn(Map.of(
                "develop", "開發", "meeting", "會議", "general", "常規事務"));
        builder = new CpmSnapshotBuilder(itemMapper, updateMapper, timeMapper, itemService);
    }

    private static CpmItem item(long id, String category, String status, String workDate, String workHours) {
        CpmItem item = new CpmItem();
        item.setId(id);
        item.setUserId(USER);
        item.setCategory(category);
        item.setStatus(status);
        item.setProgress(50);
        item.setWorkDate(LocalDate.parse(workDate));
        item.setWorkHours(workHours == null ? null : new BigDecimal(workHours));
        item.setDeleted(0);
        item.setTitle("事項" + id);
        return item;
    }

    private static CpmTimeEntry segment(long itemId, String date, String start, int minutes) {
        CpmTimeEntry entry = new CpmTimeEntry();
        entry.setItemId(itemId);
        entry.setUserId(USER);
        entry.setWorkDate(LocalDate.parse(date));
        entry.setStartTime(start == null ? null : LocalTime.parse(start));
        entry.setEndTime(start == null ? null : LocalTime.parse(start).plusMinutes(minutes));
        entry.setCrossesMidnight(0);
        entry.setDurationMinutes(minutes);
        entry.setDeleted(0);
        return entry;
    }

    private static CpmItemUpdate update(long itemId, String date, int progress, String status) {
        CpmItemUpdate row = new CpmItemUpdate();
        row.setItemId(itemId);
        row.setUpdateDate(LocalDate.parse(date));
        row.setProgress(progress);
        row.setStatus(status);
        return row;
    }

    private void given(List<CpmItem> items, List<CpmItemUpdate> updates, List<CpmTimeEntry> segments) {
        List<Long> ids = new ArrayList<>();
        items.forEach(item -> ids.add(item.getId()));
        when(updateMapper.listActiveItemIds(anyLong(), any(), any())).thenReturn(ids);
        when(itemMapper.selectBatchIds(any())).thenReturn(items);
        when(updateMapper.listByUserAndRange(anyLong(), any(), any())).thenReturn(updates);
        when(timeMapper.listByUserAndRange(anyLong(), any(), any())).thenReturn(segments);
    }

    @Test
    @DisplayName("日均分母是「有投入的天数」而不是周期自然天数：否则周末把日均拉成假数字")
    void dailyAverageDividesByActiveDaysNotCalendarDays() {
        // 周期是 11-16 ~ 11-22 共 7 天，但只有两天有投入：60 + 120 = 180 分钟
        given(List.of(item(1L, "develop", "doing", "2026-11-16", null)), List.of(),
                List.of(segment(1L, "2026-11-16", "09:00", 60),
                        segment(1L, "2026-11-18", "14:00", 120)));

        CpmDto.Snapshot.TimeTotals time = builder.build(USER, "week", START, END).getTime();

        assertEquals(180, time.getTotalMinutes());
        assertEquals(2, time.getActiveDays(), "有投入的天数：11-16 与 11-18");
        assertEquals(90, time.getAvgMinutesPerActiveDay(), "180/2，不是 180/7");
        assertEquals(2, time.getByDay().size(), "只给有投入的那两天；周期共 7 天，服务端不为其余 5 天编 0 分钟的一行");
        assertEquals("2026-11-18", time.getPeakDate());
        assertEquals(120, time.getPeakMinutes());
    }

    @Test
    @DisplayName("精确时段与手工工时分列后相加：有精确区间时绝不两种口径同时计入")
    void preciseAndManualAreSplitNeverDoubleCounted() {
        given(List.of(
                // 有 90 分钟精确时段，同时又留着一条旧的手工 3h：只能算 90 分钟
                item(1L, "develop", "doing", "2026-11-16", "3.0"),
                // 只有手工 1.5h，没有任何时段：按估算计入
                item(2L, "meeting", "done", "2026-11-17", "1.5")),
                List.of(), List.of(segment(1L, "2026-11-16", "09:00", 90)));

        CpmDto.Snapshot snapshot = builder.build(USER, "week", START, END);

        assertEquals(90, snapshot.getTime().getPreciseMinutes());
        assertEquals(90, snapshot.getTime().getManualFallbackMinutes(), "1.5h 折算 90 分钟，标估算");
        assertEquals(180, snapshot.getTime().getTotalMinutes());

        CpmDto.Snapshot.Entry first = snapshot.getGroups().get(0).getItems().get(0);
        assertEquals(90, first.getMinutes());
        assertEquals("segment", first.getMinutesSource());
        assertTrue(snapshot.getGroups().stream()
                .flatMap(g -> g.getItems().stream())
                .anyMatch(e -> "manual".equals(e.getMinutesSource())
                        && Integer.valueOf(90).equals(e.getMinutes())),
                "无时段的条目应退回手工工时并如实标 manual");
    }

    @Test
    @DisplayName("既无时段也无手工工时的条目给 null 而不是 0：0 会被读成「这件事没花时间」")
    void noTimeAtAllGivesNullNotZero() {
        given(List.of(item(1L, "general", "doing", "2026-11-16", null)), List.of(), List.of());

        CpmDto.Snapshot snapshot = builder.build(USER, "week", START, END);

        assertNull(snapshot.getGroups().get(0).getItems().get(0).getMinutes());
        assertEquals("none", snapshot.getGroups().get(0).getItems().get(0).getMinutesSource());
        assertEquals(0, snapshot.getTime().getTotalMinutes());
        assertEquals(0, snapshot.getTime().getActiveDays());
        assertNull(snapshot.getTime().getPeakDate(), "没有投入时不给峰值，而不是给一个 0 分钟峰值");
    }

    @Test
    @DisplayName("分类占比按 code 归并、label 随行带出；分组分钟与明细自洽（合计=明细之和）")
    void categoryRollupIsSelfConsistentWithDetail() {
        given(List.of(
                item(1L, "develop", "doing", "2026-11-16", null),
                item(2L, "develop", "done", "2026-11-17", null),
                item(3L, "meeting", "doing", "2026-11-18", null)),
                List.of(),
                List.of(segment(1L, "2026-11-16", "09:00", 100),
                        segment(2L, "2026-11-17", "09:00", 50),
                        segment(3L, "2026-11-18", "13:00", 150)));

        CpmDto.Snapshot snapshot = builder.build(USER, "week", START, END);

        int groupSum = snapshot.getGroups().stream().mapToInt(CpmDto.Snapshot.Group::getMinutes).sum();
        assertEquals(snapshot.getTime().getTotalMinutes(), groupSum,
                "分类分组合计必须等于工时总数，否则界面会出现两个总投入");
        assertEquals(150, snapshot.getTime().getByCategory().get(0).getMinutes(), "開發 100+50");
        assertEquals("開發", snapshot.getTime().getByCategory().get(0).getCategoryLabel());
        assertEquals("develop", snapshot.getTime().getByCategory().get(0).getCategory());
    }

    @Test
    @DisplayName("事项投入 Top N 截断到 5 条并按分钟降序（再多就没人看，且排序方向不能飘）")
    void topItemsTruncatedAndOrdered() {
        List<CpmItem> items = new ArrayList<>();
        List<CpmTimeEntry> segments = new ArrayList<>();
        for (long id = 1; id <= 8; id++) {
            items.add(item(id, "develop", "doing", "2026-11-16", null));
            segments.add(segment(id, "2026-11-16", "09:00", (int) (id * 10)));
        }
        given(items, List.of(), segments);

        CpmDto.Snapshot.TimeTotals time = builder.build(USER, "week", START, END).getTime();

        assertEquals(5, time.getTopItems().size());
        assertEquals(80L, time.getTopItems().get(0).getMinutes(), "最大的排最前");
        assertEquals(40L, time.getTopItems().get(4).getMinutes());
        assertNotNullTitle(time);
    }

    private static void assertNotNullTitle(CpmDto.Snapshot.TimeTotals time) {
        assertTrue(time.getTopItems().stream().allMatch(row -> row.getTitle() != null),
                "Top N 要带标题：只有 id 的清单在导出件和界面上都读不出是什么事");
    }

    @Test
    @DisplayName("六值状态全部入桶：新增的已取消/延期不能被漏掉，否则完成率与受阻数一起失真")
    void allSixStatusesAreBucketed() {
        List<CpmItem> items = List.of(
                item(1L, "develop", CpmConstants.STATUS_DONE, "2026-11-16", null),
                item(2L, "develop", CpmConstants.STATUS_DOING, "2026-11-16", null),
                item(3L, "develop", CpmConstants.STATUS_TODO, "2026-11-16", null),
                item(4L, "develop", CpmConstants.STATUS_BLOCKED, "2026-11-16", null),
                item(5L, "develop", CpmConstants.STATUS_CANCELLED, "2026-11-16", null),
                item(6L, "develop", CpmConstants.STATUS_DEFERRED, "2026-11-16", null));
        given(items, List.of(), List.of());

        CpmDto.Snapshot.Totals totals = builder.build(USER, "week", START, END).getTotals();

        assertEquals(1, totals.getDone());
        assertEquals(1, totals.getDoing());
        assertEquals(1, totals.getTodo());
        assertEquals(1, totals.getBlocked());
        assertEquals(1, totals.getCancelled(), "已取消漏掉会让完成率的分母虚高");
        assertEquals(1, totals.getDeferred());
        assertEquals(6, totals.getTotal());
    }

    @Test
    @DisplayName("期末状态取期间内最后一笔流水：轨迹保留每日百分比，不重写任何数字")
    void latestUpdateWinsAndTrailKept() {
        given(List.of(item(1L, "develop", "done", "2026-11-16", "2.0")),
                List.of(update(1L, "2026-11-16", 30, CpmConstants.STATUS_DOING),
                        update(1L, "2026-11-18", 70, CpmConstants.STATUS_DOING),
                        update(1L, "2026-11-20", 100, CpmConstants.STATUS_DONE)),
                List.of());

        CpmDto.Snapshot.Entry entry = builder.build(USER, "week", START, END)
                .getGroups().get(0).getItems().get(0);

        assertEquals(CpmConstants.STATUS_DONE, entry.getStatus());
        assertEquals(List.of(30, 70, 100), entry.getTrail());
        // 有精确时段时才用时段的分钟数；这里没有流水对应的时段，但主表 status=done 时也不该由条目 work_hours 造出工时
        assertEquals(120, entry.getMinutes(), "无时段时退回条目手工工时 2.0h");
    }

    @Test
    @DisplayName("时段按开始时刻排序，未填时刻的排在最后（界面读区间顺序不能乱）")
    void segmentsSortedByStartTime() {
        given(List.of(item(1L, "develop", "doing", "2026-11-16", null)), List.of(),
                List.of(segment(1L, "2026-11-16", "15:00", 60),
                        segment(1L, "2026-11-16", "09:00", 30),
                        // 只有时长没有区间：补记场景，必须排在有时段的后面而不是抛 NPE
                        segment(1L, "2026-11-16", null, 15)));

        CpmDto.Snapshot.Entry entry = builder.build(USER, "week", START, END)
                .getGroups().get(0).getItems().get(0);

        assertEquals(3, entry.getSegments().size());
        assertEquals("09:00", entry.getSegments().get(0).getStartTime());
        assertEquals("15:00", entry.getSegments().get(1).getStartTime());
        assertNull(entry.getSegments().get(2).getStartTime());
        assertEquals(105, entry.getMinutes());
    }
}

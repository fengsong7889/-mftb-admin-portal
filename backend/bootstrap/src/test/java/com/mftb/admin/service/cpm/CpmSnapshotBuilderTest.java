/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * CPM 聚合与周期口径钉死——「数字说谎」级别的回归在这里拦截。
 * 对齐 RdmDailyReport 移动端测试的分层：期末收敛、去重、非法周期拒绝、无流水回退。
 */
class CpmSnapshotBuilderTest {

    private CpmItemMapper itemMapper;
    private CpmItemUpdateMapper updateMapper;
    private CpmItemService itemService;
    private CpmSnapshotBuilder builder;
    private CpmPeriods periods;

    @BeforeEach
    void setUp() {
        itemMapper = mock(CpmItemMapper.class);
        updateMapper = mock(CpmItemUpdateMapper.class);
        itemService = mock(CpmItemService.class);
        when(itemService.categoryLabels()).thenReturn(java.util.Map.of("develop", "開發", "prd_review", "需求評審"));
        builder = new CpmSnapshotBuilder(itemMapper, updateMapper, itemService);
        periods = new CpmPeriods();
        ReflectionTestUtils.setField(periods, "businessTimezone", "Asia/Shanghai");
    }

    private static CpmItem item(long id, String category, String status, int progress, String workDate) {
        CpmItem item = new CpmItem();
        item.setId(id);
        item.setCategory(category);
        item.setStatus(status);
        item.setProgress(progress);
        item.setTitle("事項" + id);
        item.setWorkDate(LocalDate.parse(workDate));
        item.setDeleted(0);
        return item;
    }

    private static CpmItemUpdate update(long itemId, String date, int progress, String status) {
        CpmItemUpdate u = new CpmItemUpdate();
        u.setItemId(itemId);
        u.setUpdateDate(LocalDate.parse(date));
        u.setProgress(progress);
        u.setStatus(status);
        return u;
    }

    @Test
    @DisplayName("同一事项期间更新四次：按 itemId 去重只算 1 项，期末取最后一笔，轨迹保留全序列")
    void dedupsByItemAndConvergesLatest() {
        LocalDate start = LocalDate.of(2026, 11, 16);
        LocalDate end = LocalDate.of(2026, 11, 22);
        when(updateMapper.listActiveItemIds(anyLong(), eq(start), eq(end))).thenReturn(List.of(1L));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(item(1, "develop", "done", 100, "2026-11-16")));
        when(updateMapper.listByUserAndRange(anyLong(), eq(start), eq(end))).thenReturn(List.of(
                update(1, "2026-11-16", 30, "doing"),
                update(1, "2026-11-18", 60, "doing"),
                update(1, "2026-11-20", 90, "doing"),
                update(1, "2026-11-21", 100, "done")));

        CpmDto.Snapshot snapshot = builder.build(7L, "week", start, end);

        assertEquals(1, snapshot.getTotals().getTotal(), "去重后只算 1 项");
        assertEquals(1, snapshot.getTotals().getDone());
        CpmDto.Snapshot.Entry entry = snapshot.getGroups().get(0).getItems().get(0);
        assertEquals(100, entry.getProgress());
        assertEquals("done", entry.getStatus());
        assertEquals(List.of(30, 60, 90, 100), entry.getTrail(), "轨迹必须保留 30→60→90→100");
    }

    @Test
    @DisplayName("同日多笔流水取后写入的 id 收敛期末，而不是字典序")
    void sameDayLastWriteWins() {
        LocalDate start = LocalDate.of(2026, 11, 16);
        LocalDate end = LocalDate.of(2026, 11, 22);
        when(updateMapper.listActiveItemIds(anyLong(), eq(start), eq(end))).thenReturn(List.of(2L));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(item(2, "develop", "doing", 50, "2026-11-16")));
        CpmItemUpdate early = update(2, "2026-11-17", 80, "doing");
        CpmItemUpdate later = update(2, "2026-11-17", 20, "doing");
        // 上游 SQL 已按 (update_date, id) 排序；这里按真实返回顺序给 [early, later]
        when(updateMapper.listByUserAndRange(anyLong(), eq(start), eq(end))).thenReturn(List.of(early, later));

        CpmDto.Snapshot snapshot = builder.build(7L, "week", start, end);
        CpmDto.Snapshot.Entry entry = snapshot.getGroups().get(0).getItems().get(0);
        assertEquals(20, entry.getProgress(), "同一天以最后写入的一行为准");
    }

    @Test
    @DisplayName("无流水的历史条目回退主表缓存，但 total 不丢口径差异")
    void fallsBackToCacheWithoutUpdates() {
        LocalDate start = LocalDate.of(2026, 11, 16);
        LocalDate end = LocalDate.of(2026, 11, 22);
        when(updateMapper.listActiveItemIds(anyLong(), eq(start), eq(end))).thenReturn(List.of(3L));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(item(3, "prd_review", "doing", 45, "2026-11-18")));
        when(updateMapper.listByUserAndRange(anyLong(), eq(start), eq(end))).thenReturn(List.of());

        CpmDto.Snapshot snapshot = builder.build(7L, "week", start, end);
        CpmDto.Snapshot.Entry entry = snapshot.getGroups().get(0).getItems().get(0);
        assertEquals(45, entry.getProgress());
        assertEquals(List.of(), entry.getTrail());
        assertEquals(1, snapshot.getTotals().getDoing());
    }

    @Test
    @DisplayName("周期起点必须周一/月初/季初：错一格唯一键就会长出两份同周期汇报")
    void periodStartMustAlign() {
        assertThrows(BusinessException.class,
                () -> periods.resolve("week", LocalDate.of(2026, 11, 17)), "周中当起点必须拒");
        assertThrows(BusinessException.class,
                () -> periods.resolve("month", LocalDate.of(2026, 11, 2)), "月中当起点必须拒");
        assertThrows(BusinessException.class,
                () -> periods.resolve("quarter", LocalDate.of(2026, 11, 1)), "非季初必须拒");
        CpmPeriods.Period week = periods.resolve("week", LocalDate.of(2026, 11, 16));
        assertEquals(LocalDate.of(2026, 11, 22), week.end());
        CpmPeriods.Period quarter = periods.resolve("quarter", LocalDate.of(2026, 10, 1));
        assertEquals(LocalDate.of(2026, 12, 31), quarter.end());
        assertEquals("2026-Q4", periods.quarterTag(LocalDate.of(2026, 11, 18)));
        assertEquals("2026-Q1", periods.quarterTag(LocalDate.of(2026, 2, 1)));
    }
}

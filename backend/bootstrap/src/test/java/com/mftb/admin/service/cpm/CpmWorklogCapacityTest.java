/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.config.migration.CpmSchemaContracts;
import com.mftb.admin.config.migration.ContractSpec;
import com.mftb.admin.dto.CpmWorklogDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.entity.CpmWorklogGroup;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmWorkCalendarMapper;
import com.mftb.admin.mapper.CpmWorklogGroupMapper;
import com.mftb.admin.service.MeetingActionSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 台账容量窗口、更早归档游标与进度历史懒加载契约。 */
class CpmWorklogCapacityTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    @Test
    @DisplayName("默认台账如实报告 2000 条截断，并返回更早归档数量")
    void ledgerReportsTruncationAndArchiveCount() {
        Fixture f = new Fixture();
        List<CpmItem> items = new ArrayList<>();
        for (long id = CpmConstants.WORKLOG_LEDGER_MAX + 1; id >= 1; id--) {
            items.add(item(id, "任务" + id, 50, TODAY.minusDays(CpmConstants.WORKLOG_LEDGER_MAX + 2 - id)));
        }
        when(f.itemMapper.listLedgerWindow(eq(7L), any(), any(), any(), any(), any(), any(), any(),
                eq(CpmConstants.WORKLOG_LEDGER_MAX + 1))).thenReturn(items);
        when(f.itemMapper.countLedgerWindow(eq(7L), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(CpmConstants.WORKLOG_LEDGER_MAX + 1);
        when(f.itemMapper.countLedgerArchive(eq(7L), any(), any(), any(), any(), any()))
                .thenReturn(50);

        CpmWorklogDto.LedgerVO vo = f.service.ledger(null, null);

        assertThat(vo.getLoadedTaskCount()).isEqualTo(CpmConstants.WORKLOG_LEDGER_MAX);
        assertThat(vo.getMatchingTaskCount()).isEqualTo(CpmConstants.WORKLOG_LEDGER_MAX + 1);
        assertThat(vo.isTruncated()).isTrue();
        assertThat(vo.isHasEarlierArchive()).isTrue();
        assertThat(vo.getEarlierArchiveCount()).isEqualTo(50);
        // 窗口 SQL 按日期倒序取最近上限条，服务层必须恢复升序；最旧一条被截掉，最新一条仍保留。
        assertThat(vo.getGroups().get(0).getTasks().get(0).getId()).isEqualTo(2L);
        assertThat(vo.getGroups().get(0).getTasks().get(vo.getGroups().get(0).getTasks().size() - 1).getId())
                .isEqualTo(CpmConstants.WORKLOG_LEDGER_MAX + 1);
        assertThat(vo.getTotals().getTotal()).isEqualTo(CpmConstants.WORKLOG_LEDGER_MAX);
        // 列表不再批量携带流水；快照仍由服务端给，历史弹层另行懒加载。
        assertThat(vo.getGroups().get(0).getTasks().get(0).getHistory()).isEmpty();
        verify(f.updateMapper, never()).listByUserAndRange(anyLong(), any(), any());
    }

    @Test
    @DisplayName("台账只取三条快照边界，不拉全量流水且期初/期末仍准确")
    void ledgerUsesCompactSnapshotBoundaries() {
        Fixture f = new Fixture();
        LocalDate from = TODAY.minusDays(5);
        LocalDate to = TODAY.minusDays(1);
        CpmItem item = item(1L, "边界快照", 80, TODAY.minusDays(10));
        when(f.itemMapper.listLedgerWindow(eq(7L), any(), eq(from), eq(to), any(), any(), any(), any(),
                eq(CpmConstants.WORKLOG_LEDGER_MAX + 1))).thenReturn(List.of(item));
        when(f.itemMapper.countLedgerWindow(eq(7L), any(), eq(from), eq(to), any(), any(), any(), any()))
                .thenReturn(1);
        when(f.updateMapper.listLatestPerItem(eq(7L), eq(List.of(1L)), isNull()))
                .thenReturn(List.of(update(1L, TODAY, 80)));
        when(f.updateMapper.listLatestPerItem(eq(7L), eq(List.of(1L)), eq(from)))
                .thenReturn(List.of(update(1L, from.minusDays(1), 40)));
        when(f.updateMapper.listLatestPerItem(eq(7L), eq(List.of(1L)), eq(to)))
                .thenReturn(List.of(update(1L, to, 60)));

        CpmWorklogDto.LedgerVO vo = f.service.ledger(from.toString(), to.toString());
        CpmWorklogDto.TaskVO task = vo.getGroups().get(0).getTasks().get(0);

        assertThat(task.getPeriodStartProgress()).isEqualTo(40);
        assertThat(task.getPeriodProgress()).isEqualTo(60);
        assertThat(task.getPeriodProgressKind()).isEqualTo(CpmProgressSnapshots.PERIOD);
        assertThat(task.getLatestProgressAt()).isEqualTo(TODAY.toString());
        assertThat(task.getHistory()).isEmpty();
        verify(f.updateMapper, never()).listByUserAndRange(anyLong(), any(), any());
    }

    @Test
    @DisplayName("容量索引已进入统一结构契约，缺索引可由启动校验自愈")
    void capacityIndexesAreRegisteredInSchemaContracts() {
        ContractSpec spec = new CpmSchemaContracts().contracts().stream()
                .filter(c -> c.name().equals("cpm-worklog-capacity-indexes"))
                .findFirst().orElseThrow();

        assertThat(spec.table()).isEqualTo("biz_cpm_item");
        assertThat(spec.requiredIndexes()).extracting(ContractSpec.IndexSpec::index)
                .containsExactly("idx_cpm_item_user_deleted_status_updated",
                        "idx_cpm_item_user_deleted_plan_start");
        assertThat(spec.requiredIndexes()).allMatch(ContractSpec.IndexSpec::healable);
    }

    @Test
    @DisplayName("更早归档按游标返回一页，并给出下一页起点")
    void archiveReturnsCursorPage() {
        Fixture f = new Fixture();
        List<CpmItem> rows = new ArrayList<>();
        for (long id = CpmConstants.WORKLOG_ARCHIVE_PAGE_DEFAULT + 1; id >= 1; id--) {
            rows.add(item(id, "归档" + id, 100, TODAY.minusMonths(13).minusDays(id)));
        }
        when(f.itemMapper.listLedgerArchive(eq(7L), any(), any(), any(), any(), any(), any(), any(),
                eq(CpmConstants.WORKLOG_ARCHIVE_PAGE_DEFAULT + 1))).thenReturn(rows);
        when(f.itemMapper.countLedgerArchive(eq(7L), any(), any(), any(), any(), any()))
                .thenReturn(150);

        CpmWorklogDto.LedgerVO vo = f.service.archive(null, null, null, null, null, null, null);

        assertThat(vo.getLoadedTaskCount()).isEqualTo(CpmConstants.WORKLOG_ARCHIVE_PAGE_DEFAULT);
        assertThat(vo.getMatchingTaskCount()).isEqualTo(150);
        assertThat(vo.isTruncated()).isTrue();
        assertThat(vo.getNextCursorId()).isEqualTo(2L);
        assertThat(vo.getNextCursorDate()).isEqualTo(TODAY.minusMonths(13).minusDays(2).toString());
        assertThat(vo.getArchiveCursor()).isNotNull();
        assertThat(vo.getArchiveCursor().getId()).isEqualTo(2L);
        assertThat(vo.getArchiveCursor().getDate()).isEqualTo(vo.getNextCursorDate());
    }

    @Test
    @DisplayName("进度历史只返回本人单条任务最近 400 天流水并如实标记截断")
    void taskHistoryIsLazyAndBounded() {
        Fixture f = new Fixture();
        CpmItem item = item(1L, "历史任务", 80, TODAY.minusDays(2));
        when(f.guard.requireOwnedItem(1L, f.current)).thenReturn(item);
        when(f.updateMapper.listByItemInRange(eq(1L), any(), any())).thenReturn(List.of(
                update(1L, TODAY.minusDays(2), 60),
                update(1L, TODAY.minusDays(1), 80)));
        when(f.updateMapper.countByItem(eq(1L))).thenReturn(3);

        CpmWorklogDto.HistoryPageVO vo = f.service.taskHistory(1L);

        assertThat(vo.getHistory()).hasSize(2);
        assertThat(vo.isTruncated()).isTrue();
    }

    @Test
    @DisplayName("历史接口先校验任务归属，越权时不读取任何流水")
    void taskHistoryRejectsForeignItemBeforeQuery() {
        Fixture f = new Fixture();
        when(f.guard.requireOwnedItem(99L, f.current))
                .thenThrow(new BusinessException("任務不存在或不屬於本人"));

        assertThatThrownBy(() -> f.service.taskHistory(99L))
                .isInstanceOf(BusinessException.class);
        verify(f.updateMapper, never()).listByItemInRange(anyLong(), any(), any());
        verify(f.updateMapper, never()).countByItem(anyLong());
    }

    private static CpmItem item(long id, String title, int progress, LocalDate date) {
        CpmItem item = new CpmItem();
        item.setId(id);
        item.setUserId(7L);
        item.setGroupId(null);
        item.setTitle(title);
        item.setCategory(CpmConstants.LEDGER_CATEGORY);
        item.setStatus(progress >= 100 ? CpmConstants.STATUS_DONE : CpmConstants.STATUS_DOING);
        item.setProgress(progress);
        item.setPlanStart(date);
        item.setPlanEnd(date);
        item.setPlanType(CpmConstants.PLAN_TYPE_PLANNED);
        item.setWorkDate(date);
        item.setVersion(0);
        item.setFollowUp(0);
        item.setBlocked(0);
        return item;
    }

    private static CpmItemUpdate update(long itemId, LocalDate date, int progress) {
        CpmItemUpdate row = new CpmItemUpdate();
        row.setItemId(itemId);
        row.setUpdateDate(date);
        row.setProgress(progress);
        row.setStatus(CpmConstants.STATUS_DOING);
        return row;
    }

    private static final class Fixture {
        final CpmWorklogGroupMapper groupMapper = mock(CpmWorklogGroupMapper.class);
        final CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        final CpmItemUpdateMapper updateMapper = mock(CpmItemUpdateMapper.class);
        final CpmWorkCalendarMapper calendarMapper = mock(CpmWorkCalendarMapper.class);
        final CpmWorkdays workdays = mock(CpmWorkdays.class);
        final CpmAccessGuard guard = mock(CpmAccessGuard.class);
        final CpmPeriods periods = mock(CpmPeriods.class);
        final MeetingActionSource meetingActions = mock(MeetingActionSource.class);
        final SysUser current = new SysUser();
        final CpmWorklogService service;

        Fixture() {
            current.setId(7L);
            current.setUsername("tester");
            current.setName("測試者");
            when(guard.currentUser()).thenReturn(current);
            when(periods.today()).thenReturn(TODAY);
            when(workdays.load(anyLong(), any(), any())).thenReturn(new CpmWorkdays.Ledger(Map.of()));
            when(itemMapper.listBySource(7L, CpmConstants.SOURCE_MEETING)).thenReturn(List.of());
            when(groupMapper.listMine(7L)).thenReturn(List.<CpmWorklogGroup>of());
            service = new CpmWorklogService(groupMapper, itemMapper, updateMapper, calendarMapper,
                    workdays, guard, periods, meetingActions);
        }
    }

    private static long anyLong() {
        return org.mockito.ArgumentMatchers.anyLong();
    }
}

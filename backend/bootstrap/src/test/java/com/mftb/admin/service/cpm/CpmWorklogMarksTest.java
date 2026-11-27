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
import com.mftb.admin.mapper.CpmWorkCalendarMapper;
import com.mftb.admin.mapper.CpmWorklogGroupMapper;
import com.mftb.admin.service.MeetingActionSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 跟进/阻塞/取消标记的服务端状态机与汇报聚合口径。 */
class CpmWorklogMarksTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 23);

    @Test
    @DisplayName("跟进标记持久化：updateWorklogMarks 带归属+版本，TaskVO 回显 true")
    void followUpMarkPersistsAndEchoes() {
        Fixture f = new Fixture();
        CpmItem item = f.item();
        when(f.guard.requireOwnedItemForUpdate(1L, f.current)).thenReturn(item);
        when(f.itemMapper.updateLedgerFields(anyLong(), anyLong(), anyInt(), any(), any(), any(), any(), any(),
                anyBoolean(), anyBoolean(), any(), any(), anyBoolean(), any(), any(), any(), any(), any())).thenReturn(1);
        CpmItem fresh = f.item();
        fresh.setVersion(1);
        fresh.setFollowUp(1);
        when(f.itemMapper.selectAliveById(1L)).thenReturn(fresh);
        when(f.itemMapper.updateWorklogMarks(eq(1L), eq(7L), eq(1), eq(1), eq(0), isNull(), eq(0), isNull(), any())).thenReturn(1);

        CpmWorklogDto.TaskForm form = new CpmWorklogDto.TaskForm();
        form.setFollowUp(true);
        CpmWorklogDto.TaskVO vo = f.service.updateTask(1L, form);

        assertThat(vo.isFollowUp()).isTrue();
        verify(f.itemMapper).updateWorklogMarks(eq(1L), eq(7L), eq(1), eq(1), eq(0), isNull(), eq(0), isNull(), any());
    }

    @Test
    @DisplayName("阻塞原因必填：空白原因在写库前拒绝，不调用字段更新")
    void blockedReasonRequired() {
        Fixture f = new Fixture();
        when(f.guard.requireOwnedItemForUpdate(1L, f.current)).thenReturn(f.item());
        CpmWorklogDto.TaskForm form = new CpmWorklogDto.TaskForm();
        form.setBlocked(true);
        form.setBlockedReason("   ");

        assertThatThrownBy(() -> f.service.updateTask(1L, form))
                .isInstanceOf(BusinessException.class).hasMessageContaining("阻塞原因");
        verify(f.itemMapper, never()).updateLedgerFields(anyLong(), anyLong(), anyInt(), any(), any(), any(), any(), any(),
                anyBoolean(), anyBoolean(), any(), any(), anyBoolean(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("取消原因必填：空白原因在写库前拒绝")
    void cancelReasonRequired() {
        Fixture f = new Fixture();
        when(f.guard.requireOwnedItemForUpdate(1L, f.current)).thenReturn(f.item());
        CpmWorklogDto.TaskForm form = new CpmWorklogDto.TaskForm();
        form.setCancelled(true);
        form.setCancelReason("");

        assertThatThrownBy(() -> f.service.updateTask(1L, form))
                .isInstanceOf(BusinessException.class).hasMessageContaining("取消原因");
    }

    @Test
    @DisplayName("取消态服务端拒写：除 restore-state 外任何更新都拒绝")
    void cancelledTaskRejectsUpdates() {
        Fixture f = new Fixture();
        CpmItem item = f.item();
        item.setStatus(CpmConstants.STATUS_CANCELLED);
        when(f.guard.requireOwnedItemForUpdate(1L, f.current)).thenReturn(item);
        CpmWorklogDto.TaskForm form = new CpmWorklogDto.TaskForm();
        form.setTitle("试图改名");

        assertThatThrownBy(() -> f.service.updateTask(1L, form))
                .isInstanceOf(BusinessException.class).hasMessageContaining("已取消任務不可編輯");
    }

    @Test
    @DisplayName("恢复取消态：清 cancel_reason、保留其它标记，status 按进度重算")
    void restoreStateClearsCancelOnly() {
        Fixture f = new Fixture();
        CpmItem item = f.item();
        item.setStatus(CpmConstants.STATUS_CANCELLED);
        item.setFollowUp(1);
        item.setBlocked(1);
        item.setBlockedReason("等待接口");
        item.setCancelReason("不再需要");
        when(f.guard.requireOwnedItemForUpdate(1L, f.current)).thenReturn(item);
        when(f.itemMapper.updateWorklogMarks(eq(1L), eq(7L), eq(0), eq(1), eq(1), eq("等待接口"), eq(0), isNull(), any())).thenReturn(1);
        CpmItem fresh = f.item();
        fresh.setStatus(CpmConstants.STATUS_DOING);
        fresh.setVersion(1);
        fresh.setFollowUp(1);
        fresh.setBlocked(1);
        fresh.setBlockedReason("等待接口");
        when(f.itemMapper.selectAliveById(1L)).thenReturn(fresh);

        CpmWorklogDto.TaskVO vo = f.service.restoreState(1L);

        assertThat(vo.isCancelled()).isFalse();
        assertThat(vo.isFollowUp()).isTrue();
        assertThat(vo.isBlocked()).isTrue();
        assertThat(vo.getState()).isEqualTo(CpmConstants.STATUS_DOING);
    }

    @Test
    @DisplayName("汇报聚合：跟进计数/均进、阻塞计数，取消项排除且不进下期计划")
    void reportAggregatesMarksAndExcludesCancelled() {
        CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        CpmItemUpdateMapper updateMapper = mock(CpmItemUpdateMapper.class);
        CpmWorklogGroupMapper groupMapper = mock(CpmWorklogGroupMapper.class);
        CpmWorkdays workdays = mock(CpmWorkdays.class);
        CpmPeriods periods = mock(CpmPeriods.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        SysUser current = new SysUser();
        current.setId(7L);
        when(guard.currentUser()).thenReturn(current);
        when(periods.today()).thenReturn(MON.plusDays(2));
        when(periods.resolve(eq("week"), any())).thenReturn(new CpmPeriods.Period("week", MON, MON.plusDays(6)));
        when(workdays.load(anyLong(), any(), any())).thenReturn(new CpmWorkdays.Ledger(Map.of()));
        when(updateMapper.listByUserAndRange(eq(7L), any(), any())).thenReturn(List.of());

        CpmItem follow = item(1L, "跟进项", 80, MON, MON.plusDays(6));
        follow.setFollowUp(1);
        follow.setBlocked(1);
        follow.setBlockedReason("等联调");
        CpmItem normal = item(2L, "普通项", 20, MON, MON.plusDays(6));
        CpmItem cancelled = item(3L, "取消项", 50, MON, MON.plusDays(6));
        cancelled.setStatus(CpmConstants.STATUS_CANCELLED);
        CpmItem cancelledFuture = item(4L, "取消的下期项", 0, MON.plusDays(7), MON.plusDays(8));
        cancelledFuture.setStatus(CpmConstants.STATUS_CANCELLED);
        when(itemMapper.listAllForUser(7L)).thenReturn(List.of(follow, normal, cancelled, cancelledFuture));
        when(groupMapper.listMine(7L)).thenReturn(List.<CpmWorklogGroup>of());

        CpmWorklogReportService service = new CpmWorklogReportService(itemMapper, updateMapper, groupMapper, workdays, periods, guard);
        CpmWorklogDto.ReportVO report = service.report("week", MON.toString());

        assertThat(report.getTotals().getTotal()).isEqualTo(2);
        assertThat(report.getTotals().getFollowUpCount()).isEqualTo(1);
        assertThat(report.getTotals().getFollowUpAvg()).isEqualTo(80);
        assertThat(report.getTotals().getBlockedCount()).isEqualTo(1);
        assertThat(report.getTotals().getCancelled()).isEqualTo(2);
        assertThat(report.getFollowUps()).hasSize(1);
        assertThat(report.getBlockedRows()).hasSize(1);
        assertThat(report.getPlan()).noneMatch(r -> r.getTaskId() == 3L || r.getTaskId() == 4L);
    }

    private static boolean anyBoolean() {
        return org.mockito.ArgumentMatchers.anyBoolean();
    }

    private static CpmItem item(long id, String title, int progress, LocalDate start, LocalDate end) {
        CpmItem item = new CpmItem();
        item.setId(id);
        item.setUserId(7L);
        item.setTitle(title);
        item.setProgress(progress);
        item.setStatus(progress >= 100 ? CpmConstants.STATUS_DONE : progress > 0 ? CpmConstants.STATUS_DOING : CpmConstants.STATUS_TODO);
        item.setPlanStart(start);
        item.setPlanEnd(end);
        item.setPlanType(CpmConstants.PLAN_TYPE_PLANNED);
        item.setWorkDate(start);
        item.setVersion(0);
        item.setFollowUp(0);
        item.setBlocked(0);
        return item;
    }

    private static final class Fixture {
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
            when(periods.today()).thenReturn(MON);
            when(workdays.load(anyLong(), any(), any())).thenReturn(new CpmWorkdays.Ledger(Map.of()));
            service = new CpmWorklogService(mock(CpmWorklogGroupMapper.class), itemMapper, updateMapper, calendarMapper,
                    workdays, guard, periods, meetingActions);
        }

        CpmItem item() {
            return CpmWorklogMarksTest.item(1L, "测试任务", 50, MON, MON.plusDays(2));
        }
    }
}

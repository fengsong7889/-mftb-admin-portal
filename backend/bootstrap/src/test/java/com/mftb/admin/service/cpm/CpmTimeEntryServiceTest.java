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
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmTimeEntry;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmTimeEntryMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 投入时段服务测试（阶段三）。
 *
 * <p>钉住的不是「能不能存进去」，而是几条最容易在后续改动里被悄悄破坏的口径：
 * 跨夜必须显式声明才加一天、起止只能同时有或同时无、显式覆盖优先于计算值、
 * 同一天允许多段（这是时段表存在的全部理由）、写库后条目缓存必须跟着回算。
 */
class CpmTimeEntryServiceTest {

    private static final SysUser SELF = user(1L, "張偉");
    private static final LocalDate DAY = LocalDate.of(2026, 11, 19);

    private CpmTimeEntryMapper timeMapper;
    private CpmItemMapper itemMapper;
    private CpmAccessGuard guard;
    private CpmPeriods periods;
    private CpmTimeEntryService service;

    /**
     * 迷你假存储：让 {@code insert} 之后 {@code listByItem} 立刻能读回来。
     *
     * <p>这不是为了「让测试过」，而是要如实模拟同事务内的 read-your-write——
     * 条目上的工时缓存由「时段表当前全量」回算而来（那是缓存的唯一正确定义），
     * 如果 mock 让 insert 后读回空集，测试就会把一条正确实现判成错误实现。
     */
    private final java.util.List<CpmTimeEntry> store = new java.util.ArrayList<>();

    @BeforeEach
    void setUp() {
        timeMapper = mock(CpmTimeEntryMapper.class);
        itemMapper = mock(CpmItemMapper.class);
        guard = mock(CpmAccessGuard.class);
        periods = mock(CpmPeriods.class);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedItem(anyLong(), any())).thenReturn(item(7L));
        // 写入路径现在先锁父行再写子行（并发时段会因外键 S→X 升级而死锁），读路径仍走非锁版本
        when(guard.requireOwnedItemForUpdate(anyLong(), any())).thenReturn(item(7L));
        when(periods.today()).thenReturn(DAY);
        when(timeMapper.insert(any(CpmTimeEntry.class))).thenAnswer(invocation -> {
            CpmTimeEntry row = invocation.getArgument(0);
            row.setId(100L + store.size());
            store.add(row);
            return 1;
        });
        when(timeMapper.listByItem(7L)).thenAnswer(invocation -> List.copyOf(store));
        when(timeMapper.firstStartOf(7L)).thenAnswer(invocation -> store.stream()
                .filter(row -> row.getStartTime() != null)
                .map(row -> java.time.LocalDateTime.of(row.getWorkDate(), row.getStartTime()))
                .min(java.time.LocalDateTime::compareTo).orElse(null));
        when(timeMapper.lastEndOf(7L)).thenAnswer(invocation -> store.stream()
                .filter(row -> row.getEndTime() != null)
                .map(row -> java.time.LocalDateTime.of(crosses(row) ? row.getWorkDate().plusDays(1)
                        : row.getWorkDate(), row.getEndTime()))
                .max(java.time.LocalDateTime::compareTo).orElse(null));
        when(timeMapper.updateOwned(anyLong(), anyLong(), anyInt(), any(), any(), any(), anyInt(), anyInt(),
                any(), anyString())).thenAnswer(invocation -> {
            CpmTimeEntry row = store.stream()
                    .filter(each -> each.getId().equals(invocation.getArgument(0))).findFirst().orElse(null);
            if (row == null) {
                return 0;
            }
            row.setDurationMinutes(invocation.getArgument(7));
            row.setVersion(row.getVersion() == null ? 1 : row.getVersion() + 1);
            return 1;
        });
        when(timeMapper.softDeleteOwned(anyLong(), anyLong(), anyString())).thenAnswer(invocation -> {
            boolean removed = store.removeIf(row -> row.getId().equals(invocation.getArgument(0)));
            return removed ? 1 : 0;
        });
        service = new CpmTimeEntryService(timeMapper, itemMapper, guard, periods);
    }

    private static SysUser user(long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setUsername("MF000" + id);
        return user;
    }

    private static CpmItem item(long id) {
        CpmItem item = new CpmItem();
        item.setId(id);
        item.setUserId(SELF.getId());
        item.setTitle("跨週期方案推進");
        item.setWorkDate(DAY);
        item.setWorkHours(new BigDecimal("3.0"));
        return item;
    }

    private static CpmDto.TimeEntryForm form(String start, String end, Boolean crosses, Integer minutes) {
        CpmDto.TimeEntryForm form = new CpmDto.TimeEntryForm();
        form.setStartTime(start);
        form.setEndTime(end);
        form.setCrossesMidnight(crosses);
        form.setDurationMinutes(minutes);
        return form;
    }

    /** 捕获刚插入的那一行，便于直接断言服务端算出来的结果而不是接口返回的包装 */
    private CpmTimeEntry capturedInsert() {
        ArgumentCaptor<CpmTimeEntry> captor = ArgumentCaptor.forClass(CpmTimeEntry.class);
        verify(timeMapper).insert(captor.capture());
        return captor.getValue();
    }

    /** 列是 TINYINT，测试里也要按「1=跨夜」判，别让 mock 比真实映射更宽松 */
    private static boolean crosses(CpmTimeEntry row) {
        return Integer.valueOf(1).equals(row.getCrossesMidnight());
    }

    @Test
    @DisplayName("起止换算耗时：9:00→10:30 记 90 分钟，并回算条目缓存")
    void computesDurationFromRange() {
        service.create(7L, form("09:00", "10:30", null, null));

        CpmTimeEntry saved = capturedInsert();
        assertEquals(90, saved.getDurationMinutes());
        assertEquals(LocalTime.of(9, 0), saved.getStartTime());
        assertEquals(SELF.getId(), saved.getUserId(), "归属人必须落本行，聚合按人+日免 JOIN");
        // 时段存在时工时由时段给出，不能再沿用旧的手工值，否则同一次投入被算两遍
        verify(itemMapper).syncTimeCache(eq(7L), eq(SELF.getId()), eq(new BigDecimal("1.5")),
                eq("segment"), any(), any(), anyString());
    }

    @Test
    @DisplayName("跨夜要显式声明才加一天：22:00→01:00 未勾选一律拒绝而不是猜成 27 小时或 -21 小时")
    void crossesMidnightMustBeDeclared() {
        service.create(7L, form("22:00", "01:00", true, null));
        assertEquals(180, capturedInsert().getDurationMinutes());

        BusinessException rejected = assertThrows(BusinessException.class,
                () -> service.create(7L, form("22:00", "01:00", false, null)));
        assertTrue(rejected.getMessage().contains("跨夜"), "拒绝理由要指向那条未声明的跨夜标记");
    }

    @Test
    @DisplayName("顺序正常的区间却勾了跨夜同样拒绝：那会凭空多出一整天投入")
    void declaredCrossMidnightOnForwardRangeIsRejected() {
        assertThrows(BusinessException.class, () -> service.create(7L, form("09:00", "17:00", true, null)));
        verify(timeMapper, never()).insert(any(CpmTimeEntry.class));
    }

    @Test
    @DisplayName("显式耗时优先于起止计算（中途离开只记实际投入）")
    void explicitDurationWinsOverRange() {
        service.create(7L, form("09:00", "18:00", null, 240));
        assertEquals(240, capturedInsert().getDurationMinutes());
    }

    @Test
    @DisplayName("起止只填一半拒绝：与 ck_cpm_time_range 同一条约束在前端先拦住")
    void halfFilledRangeRejected() {
        assertThrows(BusinessException.class, () -> service.create(7L, form("09:00", null, null, null)));
        assertThrows(BusinessException.class, () -> service.create(7L, form(null, "10:00", null, null)));
        verify(timeMapper, never()).insert(any(CpmTimeEntry.class));
    }

    @Test
    @DisplayName("既不填起止也不填耗时拒绝：不给一段 0 分钟的假事实")
    void emptyInputRejected() {
        assertThrows(BusinessException.class, () -> service.create(7L, form(null, null, null, null)));
    }

    @Test
    @DisplayName("耗时上下限：0/负数/超过 1440 分钟一律拒绝（列是 INT，物理上没拦住脏值）")
    void durationBounds() {
        assertThrows(BusinessException.class, () -> service.create(7L, form(null, null, null, 0)));
        assertThrows(BusinessException.class, () -> service.create(7L, form(null, null, null, -30)));
        assertThrows(BusinessException.class, () -> service.create(7L, form(null, null, null, 1441)));
    }

    @Test
    @DisplayName("补记历史允许，未来日期拒绝：投入是已发生的事实，不能预先领工时")
    void backfillAllowedButFutureRejected() {
        service.create(7L, form("09:00", "10:00", null, null));
        CpmDto.TimeEntryForm form = form("09:00", "10:00", null, null);
        form.setWorkDate(DAY.plusDays(1).toString());
        assertThrows(BusinessException.class, () -> service.create(7L, form));

        form.setWorkDate("不是日期");
        assertThrows(BusinessException.class, () -> service.create(7L, form));
    }

    @Test
    @DisplayName("同日多段允许并存（时段表存在的全部理由），但单条目单日有段数上限")
    void multipleSegmentsPerDayAllowedWithCap() {
        when(timeMapper.countOnItemDate(7L, DAY)).thenReturn(2);
        service.create(7L, form("09:00", "10:00", null, null));
        assertNotNull(capturedInsert());

        when(timeMapper.countOnItemDate(7L, DAY)).thenReturn(CpmConstants.TIME_ENTRIES_PER_ITEM_DAY_MAX);
        assertThrows(BusinessException.class, () -> service.create(7L, form("11:00", "12:00", null, null)));
    }

    @Test
    @DisplayName("越权改别人的条目直接被归属守卫拒绝，不落任何时段")
    void foreignItemRejected() {
        when(guard.requireOwnedItemForUpdate(9L, SELF)).thenThrow(new BusinessException("只能操作自己的工作記錄"));

        assertThrows(BusinessException.class, () -> service.create(9L, form("09:00", "10:00", null, null)));
        verify(timeMapper, never()).insert(any(CpmTimeEntry.class));
    }

    @Test
    @DisplayName("改时段必须同时匹配 id 与归属人：只判版本等于允许拿别人 id 改别人工时")
    void updateCarriesOwnerIntoWhere() {
        CpmTimeEntry existing = new CpmTimeEntry();
        existing.setId(3L);
        existing.setItemId(7L);
        existing.setUserId(SELF.getId());
        existing.setVersion(2);
        when(timeMapper.selectById(3L)).thenReturn(existing);
        when(timeMapper.updateOwned(eq(3L), eq(SELF.getId()), eq(2), any(), any(), any(),
                eq(0), eq(60), any(), anyString())).thenReturn(1);

        CpmDto.TimeEntryForm form = form("09:00", "10:00", null, null);
        form.setVersion(2);
        service.update(3L, form);

        verify(timeMapper).updateOwned(eq(3L), eq(SELF.getId()), eq(2), any(), any(), any(),
                eq(0), eq(60), any(), anyString());
    }

    @Test
    @DisplayName("时段归属他人时更新与删除都拒绝，且不回算别人条目的缓存")
    void foreignSegmentRejected() {
        CpmTimeEntry other = new CpmTimeEntry();
        other.setId(4L);
        other.setItemId(8L);
        other.setUserId(999L);
        other.setDeleted(0);
        when(timeMapper.selectById(4L)).thenReturn(other);

        assertThrows(BusinessException.class, () -> service.update(4L, form("09:00", "10:00", null, null)));
        assertThrows(BusinessException.class, () -> service.delete(4L));
        verify(timeMapper, never()).updateOwned(anyLong(), anyLong(), anyInt(), any(), any(), any(), anyInt(),
                anyInt(), any(), anyString());
        verify(timeMapper, never()).softDeleteOwned(anyLong(), anyLong(), anyString());
    }

    @Test
    @DisplayName("时段被清空时条目退回手工工时口径并标 manual，不抹掉用户自己填过的数字")
    void cacheFallsBackToManualWhenNoSegments() {
        CpmTimeEntry existing = new CpmTimeEntry();
        existing.setId(5L);
        existing.setItemId(7L);
        existing.setUserId(SELF.getId());
        existing.setDeleted(0);
        when(timeMapper.selectById(5L)).thenReturn(existing);
        when(timeMapper.softDeleteOwned(5L, SELF.getId(), SELF.getName())).thenReturn(1);
        when(timeMapper.listByItem(7L)).thenReturn(List.of());

        service.delete(5L);

        verify(itemMapper).syncTimeCache(eq(7L), eq(SELF.getId()), eq(new BigDecimal("3.0")),
                eq("manual"), eq(null), eq(null), anyString());
    }
}

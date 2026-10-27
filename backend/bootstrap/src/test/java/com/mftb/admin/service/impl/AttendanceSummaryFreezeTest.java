package com.mftb.admin.service.impl;

import com.mftb.admin.service.HrLeaveQueryAdapter;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AttDaySummary;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttMonthlySummary;
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
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 月度汇总状态机与冻结边界测试。
 * <p>
 * 月报是薪酬核算的唯一取数出口，状态机一旦能被跳过或回退，就会出现「薪酬按 A 版本算、
 * 页面显示 B 版本」。这里钉住：单向推进、批次号只在冻结时生成、已冻结月份整体不参与重算。
 */
class AttendanceSummaryFreezeTest {

    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttGroupMemberMapper memberMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private AttShiftMapper shiftMapper;
    @Mock
    private AttPunchLogMapper punchMapper;
    @Mock
    private AttExceptionMapper exceptionMapper;
    @Mock
    private AttDaySummaryMapper dayMapper;
    @Mock
    private AttMonthlySummaryMapper monthlyMapper;
    @Mock
    private AttHolidayMapper holidayMapper;
    @Mock
    private HrLeaveRequestMapper leaveMapper;
    @Mock
    private BizSeqService bizSeqService;
    @Mock
    private OperatorResolver operatorResolver;
    @Mock
    private com.mftb.admin.service.SysConfigService sysConfigService;

    private AttendanceSummaryService service;

    /**
     * 预热 MyBatis-Plus 的 lambda 列缓存。
     * <p>为什么需要：{@code LambdaQueryWrapper.select(Entity::getX)} 会 **立即** 解析列名
     * （而 {@code .eq(...)} 是延迟到拼 SQL 时才解析），纯 Mockito 单测没有 mapper 扫描，
     * 不预热就会报 "can not find lambda cache"。{@code frozenMonths()} 正好用了 select 投影。
     */
    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(AttGroup.class, AttMonthlySummary.class, AttDaySummary.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceSummaryServiceImpl(groupMapper, memberMapper, scheduleMapper, shiftMapper,
                punchMapper, exceptionMapper, dayMapper, monthlyMapper, holidayMapper, new HrLeaveQueryAdapter(leaveMapper),
                bizSeqService, operatorResolver, sysConfigService, org.mockito.Mockito.mock(com.mftb.admin.service.OrgScopeService.class));
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");
        // 口径参数未配置：引擎必须回退默认值而不是抛错（定时任务里没人能看到异常）
        when(sysConfigService.getConfigValueCached(anyString())).thenReturn(null);
    }

    @Test
    @DisplayName("冻结只作用于 draft 行，并生成批次号供薪酬对账")
    void freezeOnlyDraftRowsAndAssignsBatchNo() {
        AttMonthlySummary draft = monthly(1L, "2026-09", AttMonthlySummary.STATUS_DRAFT);
        AttMonthlySummary alreadyFrozen = monthly(2L, "2026-09", AttMonthlySummary.STATUS_FROZEN);
        when(monthlyMapper.selectById(1L)).thenReturn(draft);
        when(monthlyMapper.selectById(2L)).thenReturn(alreadyFrozen);
        when(bizSeqService.next(anyString(), any(LocalDate.class))).thenReturn("AT2026090001");

        Map<String, Object> result = service.freeze(List.of(1L, 2L));

        assertEquals(1, result.get("changed"));
        assertEquals(1, result.get("skipped"), "已冻结行不能被二次冻结，否则批次号会被换掉");
        assertEquals("AT2026090001", result.get("batchNo"));
        assertEquals(AttMonthlySummary.STATUS_FROZEN, draft.getStatus());
        assertEquals("AT2026090001", draft.getBatchNo());
        assertEquals("陳小紅", draft.getFrozenBy());
        assertNotNull(draft.getFrozenAt());
        verify(monthlyMapper).updateById(draft);
        verify(monthlyMapper, never()).updateById(alreadyFrozen);
    }

    @Test
    @DisplayName("同步薪酬只能从 frozen 出发，draft 行直接跳过")
    void syncToPayrollRequiresFrozen() {
        AttMonthlySummary draft = monthly(3L, "2026-09", AttMonthlySummary.STATUS_DRAFT);
        AttMonthlySummary frozen = monthly(4L, "2026-09", AttMonthlySummary.STATUS_FROZEN);
        when(monthlyMapper.selectById(3L)).thenReturn(draft);
        when(monthlyMapper.selectById(4L)).thenReturn(frozen);

        Map<String, Object> result = service.syncToPayroll(List.of(3L, 4L));

        assertEquals(1, result.get("changed"));
        assertEquals(1, result.get("skipped"));
        assertEquals(AttMonthlySummary.STATUS_DRAFT, draft.getStatus(), "未冻结就交薪酬等于交了一份还会变的数");
        assertEquals(AttMonthlySummary.STATUS_SYNCED, frozen.getStatus());
        assertNotNull(frozen.getSyncedAt());
    }

    @Test
    @DisplayName("空选择与非法状态一律拒绝，不产生静默无操作的成功响应")
    void transitionGuards() {
        assertThrows(BusinessException.class, () -> service.freeze(List.of()));
        assertThrows(BusinessException.class, () -> service.syncToPayroll(null));
    }

    @Test
    @DisplayName("重算整体跳过已冻结月份，并把跳过天数回报给界面")
    void recalculateSkipsFrozenMonths() {
        when(groupMapper.selectList(any())).thenReturn(List.of(enabledGroup()));
        when(monthlyMapper.selectList(any()))
                .thenReturn(List.of(monthly(9L, "2026-09", AttMonthlySummary.STATUS_FROZEN)));
        when(memberMapper.selectList(any())).thenReturn(List.of());

        Map<String, Object> result = service.recalculateDaily(
                LocalDate.of(2026, 9, 28), LocalDate.of(2026, 10, 2), null);

        // 9/28~9/30 属已冻结月份，10/1~10/2 才可重算
        assertEquals(3, result.get("skippedFrozen"));
        assertEquals(2, result.get("recalculated"));
        assertEquals(1, result.get("groups"));
    }

    @Test
    @DisplayName("重算区间校验：起止倒置与超长区间都在入口拦掉")
    void recalculateRangeGuards() {
        assertThrows(BusinessException.class,
                () -> service.recalculateDaily(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1), null));
        assertThrows(BusinessException.class,
                () -> service.recalculateDaily(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 10, 1), null));
        verify(dayMapper, never()).insert(any(AttDaySummary.class));
    }

    @Test
    @DisplayName("月份格式必须为 yyyy-MM，非法值给业务错误而不是 500")
    void generateMonthlyValidatesMonth() {
        assertThrows(BusinessException.class, () -> service.generateMonthly("2026/10", null));
        assertThrows(BusinessException.class, () -> service.generateMonthly("  ", null));
    }

    @Test
    @DisplayName("isMonthFrozen 认 frozen 与 synced 两种状态")
    void isMonthFrozenCoversBothLockedStates() {
        when(monthlyMapper.selectCount(any())).thenReturn(1L);
        assertTrue(service.isMonthFrozen("2026-09"));
        when(monthlyMapper.selectCount(any())).thenReturn(0L);
        assertFalse(service.isMonthFrozen("2026-10"));
    }

    private AttMonthlySummary monthly(Long id, String month, String status) {
        AttMonthlySummary row = new AttMonthlySummary();
        row.setId(id);
        row.setStatMonth(month);
        row.setUserId(101L);
        row.setEmpNo("MF00123");
        row.setEmpName("李大偉");
        row.setStatus(status);
        return row;
    }

    private AttGroup enabledGroup() {
        AttGroup group = new AttGroup();
        group.setId(7L);
        group.setGroupNo("AG2026100001");
        group.setGroupName("總部固定白班");
        group.setGroupType(AttGroup.TYPE_FIXED);
        group.setStatus("enabled");
        return group;
    }
}

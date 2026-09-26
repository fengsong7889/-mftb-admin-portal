package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.ContractExpirySummaryVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 合同到期预警 (P0) 单元测试：分桶口径、窗口钳制、最近到期排序、非法分桶拒绝。
 * 数据层用 mock（分桶 SQL 条件由 applyExpiryBucket 写入 wrapper，此处校验调用与聚合逻辑）。
 */
class EmployeeContractExpiryTest {

    private EmpContractMapper contractMapper;
    private EmployeeContractServiceImpl service;

    @BeforeEach
    void setUp() {
        contractMapper = mock(EmpContractMapper.class);
        service = new EmployeeContractServiceImpl(
                contractMapper, mock(SysUserMapper.class), mock(OperatorResolver.class));
    }

    private EmpContract contract(long id, Long userId, LocalDate endDate, String status) {
        EmpContract c = new EmpContract();
        c.setId(id);
        c.setUserId(userId);
        c.setContractNo("HT" + id);
        c.setStartDate(endDate == null ? LocalDate.now().minusYears(1) : endDate.minusYears(1));
        c.setEndDate(endDate);
        c.setStatus(status);
        return c;
    }

    @Test
    void bucketsAreExclusiveAndCountedByRemainingDays() {
        LocalDate today = LocalDate.now();
        List<EmpContract> rows = new ArrayList<>(List.of(
                contract(1, 11L, today.minusDays(1), "生效中"),   // 已过期
                contract(2, 12L, today, "生效中"),                 // 0 天 → 计入 30/60/90
                contract(3, 13L, today.plusDays(29), "生效中"),    // 29 天 → 30/60/90
                contract(4, 14L, today.plusDays(45), "生效中"),    // 45 天 → 60/90
                contract(5, 15L, today.plusDays(80), "生效中"),    // 80 天 → 90
                contract(6, 16L, today.plusDays(200), "生效中"),   // 窗口外
                contract(7, 17L, null, "生效中")                   // 无固定期限
        ));
        when(contractMapper.selectList(any())).thenReturn(rows);
        when(contractMapper.selectCount(any())).thenReturn(7L);

        ContractExpirySummaryVO vo = service.expirySummary(90);

        // total 为台账「全部」页签计数，不受状态/分桶影响
        assertEquals(7, vo.getTotal());
        assertEquals(1, vo.getExpired());
        // 剩余天数 0/29/45/80 → 分别落在 30/30/60/90 桶（互斥累计：dueX 为「X 天内」累计口径）
        assertEquals(2, vo.getDue30());
        assertEquals(3, vo.getDue60());
        assertEquals(4, vo.getDue90());
        assertEquals(1, vo.getNoEndDate());
        assertEquals(90, vo.getDays());
        // soonest 按到期日升序，且不含已过期/窗口外/无期限
        List<Long> soonestIds = vo.getSoonest().stream().map(v -> v.getId()).toList();
        assertEquals(List.of(2L, 3L, 4L, 5L), soonestIds);
    }

    @Test
    void windowIsClampedToRangeAndDefaultsWhenNonPositive() {
        when(contractMapper.selectList(any())).thenReturn(List.of());
        assertEquals(90, service.expirySummary(0).getDays());
        assertEquals(90, service.expirySummary(-5).getDays());

        LocalDate today = LocalDate.now();
        when(contractMapper.selectList(any()))
                .thenReturn(List.of(contract(1, 11L, today.plusDays(120), "生效中")));
        // 窗口 365 天上限内可放大：120 天合同应进入 soonest
        assertEquals(1, service.expirySummary(200).getSoonest().size());
        // 超出上限被钳到 365
        assertEquals(365, service.expirySummary(1000).getDays());
        // 窗口小于剩余天数时不进入 soonest
        assertEquals(0, service.expirySummary(30).getSoonest().size());
    }

    @Test
    void soonestIsCappedAtTwentyRows() {
        LocalDate today = LocalDate.now();
        List<EmpContract> rows = new ArrayList<>();
        for (int i = 1; i <= 30; i++) {
            rows.add(contract(i, 100L + i, today.plusDays(i), "生效中"));
        }
        when(contractMapper.selectList(any())).thenReturn(rows);

        ContractExpirySummaryVO vo = service.expirySummary(90);
        assertEquals(20, vo.getSoonest().size());
        assertEquals(1L, vo.getSoonest().get(0).getId());
    }

    @Test
    void ledgerRejectsUnknownExpiryBucket() {
        when(contractMapper.selectList(any())).thenReturn(List.of());
        // 先通过 all 桶（不加日期条件）确认查询可达
        PageResult<?> ok = service.ledger(1, 10, null, null, null, null, "all");
        assertEquals(0, ok.getTotal());

        // 非法分桶必须抛出（默认拒绝），且 empty/null 等价于 all
        assertThrows(BusinessException.class,
                () -> service.ledger(1, 10, null, null, null, null, "due45"));
        assertEquals(0, service.ledger(1, 10, null, null, null, null, null).getTotal());
        assertEquals(0, service.ledger(1, 10, null, null, null, null, "  ").getTotal());
        // all / null / 空白 各查询一次；非法分桶在构建条件前抛出，不触达数据层
        verify(contractMapper, org.mockito.Mockito.times(3)).selectList(any());
    }
}

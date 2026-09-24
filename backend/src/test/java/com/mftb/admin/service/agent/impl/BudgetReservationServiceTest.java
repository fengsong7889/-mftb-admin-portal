package com.mftb.admin.service.agent.impl;

import com.mftb.admin.entity.AiBudgetLedger;
import com.mftb.admin.mapper.AiBudgetLedgerMapper;
import com.mftb.admin.service.agent.BudgetReservationService.Reservation;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §B.1 预算流水：reserve/settle/release 幂等与状态机推进 */
@ExtendWith(MockitoExtension.class)
class BudgetReservationServiceTest {

    @Mock private AiBudgetLedgerMapper ledgerMapper;

    @InjectMocks private BudgetReservationServiceImpl service;

    @BeforeAll
    static void primeLambdaCache() {
        TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(new MybatisConfiguration(), ""),
                AiBudgetLedger.class);
    }

    @Test
    void reserveInsertsNewRowWithEstimatedVerification() {
        when(ledgerMapper.selectOne(any())).thenReturn(null);
        org.mockito.Mockito.doAnswer(inv -> { inv.<AiBudgetLedger>getArgument(0).setId(1L); return 1; }).when(ledgerMapper).insert(any(AiBudgetLedger.class));
        Reservation r = service.reserve("req-1", "alice", "deepseek-chat",
                1000, 500, new BigDecimal("2"), new BigDecimal("3"), "CNY");
        assertTrue(r.isNewlyCreated());

        ArgumentCaptor<AiBudgetLedger> cap = ArgumentCaptor.forClass(AiBudgetLedger.class);
        verify(ledgerMapper).insert(cap.capture());
        AiBudgetLedger row = cap.getValue();
        assertEquals("RESERVED", row.getStatus());
        assertEquals("ESTIMATED", row.getVerificationStatus());
        assertEquals(1500, row.getReservationTokens());
        assertEquals(0, new BigDecimal("0.003500").compareTo(row.getReservedCost()));
    }

    @Test
    void reserveWithMissingPriceMarksUnknown() {
        when(ledgerMapper.selectOne(any())).thenReturn(null);
        org.mockito.Mockito.doAnswer(inv -> { inv.<AiBudgetLedger>getArgument(0).setId(2L); return 1; }).when(ledgerMapper).insert(any(AiBudgetLedger.class));
        service.reserve("req-miss", "bob", "unknown-model", 1000, 500, null, null, null);
        ArgumentCaptor<AiBudgetLedger> cap = ArgumentCaptor.forClass(AiBudgetLedger.class);
        verify(ledgerMapper).insert(cap.capture());
        assertEquals("UNKNOWN", cap.getValue().getVerificationStatus());
        assertEquals(0, BigDecimal.ZERO.compareTo(cap.getValue().getReservedCost()));
    }

    @Test
    void reserveIsIdempotentOnExistingRequestId() {
        AiBudgetLedger existing = new AiBudgetLedger();
        existing.setId(42L);
        existing.setRequestId("dup");
        when(ledgerMapper.selectOne(any())).thenReturn(existing);

        Reservation r = service.reserve("dup", "alice", "m", 10, 20, null, null, null);
        assertFalse(r.isNewlyCreated());
        assertEquals(42L, r.getLedgerId());
        verify(ledgerMapper, never()).insert(any(AiBudgetLedger.class));
    }

    @Test
    void reserveRejectsBlankRequestId() {
        assertThrows(IllegalArgumentException.class,
                () -> service.reserve("", "alice", "m", 1, 1, null, null, null));
    }

    @Test
    void settleMarksVerifiedWhenPriced() {
        when(ledgerMapper.update(any(), any())).thenReturn(1);
        service.settle("req-2", 1200, 600, 0,
                new BigDecimal("2"), new BigDecimal("3"), null, "CNY");
        verify(ledgerMapper, times(1)).update(any(), any());
    }

    @Test
    void settleIsSilentWhenReservedRowAlreadyAdvanced() {
        when(ledgerMapper.update(any(), any())).thenReturn(0);
        service.settle("req-gone", 100, 100, 0, null, null, null, null);
        verify(ledgerMapper, times(1)).update(any(), any());
    }

    @Test
    void releaseIsNoopOnBlankRequestId() {
        service.release(null, "err");
        verify(ledgerMapper, never()).update(any(), any());
    }
}

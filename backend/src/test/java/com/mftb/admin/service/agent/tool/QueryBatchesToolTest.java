package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.FinBatchQuery;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinBatchService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QueryBatchesToolTest {

    @Mock private FinBatchService finBatchService;

    @Test
    void parsesDateAndAmounts() {
        when(finBatchService.page(any())).thenReturn(new PageResult<>(List.of(), 0L));
        QueryBatchesTool tool = new QueryBatchesTool(finBatchService, new ObjectMapper());
        tool.execute(Map.of(
                "tradeFrom", "2026-09-01",
                "tradeTo", "2026-09-30",
                "amountMin", "1000",
                "amountMax", 50000,
                "batchType", "recharge"
        ), new AgentTool.ToolCallContext("alice", null));
        ArgumentCaptor<FinBatchQuery> cap = ArgumentCaptor.forClass(FinBatchQuery.class);
        verify(finBatchService).page(cap.capture());
        FinBatchQuery q = cap.getValue();
        assertEquals(LocalDate.parse("2026-09-01"), q.getTradeFrom());
        assertEquals(LocalDate.parse("2026-09-30"), q.getTradeTo());
        assertEquals(new BigDecimal("1000"), q.getAmountMin());
        assertEquals(new BigDecimal("50000"), q.getAmountMax());
        assertEquals("recharge", q.getBatchType());
    }

    @Test
    void malformedInputsAreIgnoredNotThrow() {
        when(finBatchService.page(any())).thenReturn(new PageResult<>(List.of(), 0L));
        QueryBatchesTool tool = new QueryBatchesTool(finBatchService, new ObjectMapper());
        tool.execute(Map.of("tradeFrom", "not-a-date", "amountMin", "abc"),
                new AgentTool.ToolCallContext("alice", null));
        ArgumentCaptor<FinBatchQuery> cap = ArgumentCaptor.forClass(FinBatchQuery.class);
        verify(finBatchService).page(cap.capture());
        assertNull(cap.getValue().getTradeFrom());
        assertNull(cap.getValue().getAmountMin());
    }
}

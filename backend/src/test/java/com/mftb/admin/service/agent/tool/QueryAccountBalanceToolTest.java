package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinAccountService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QueryAccountBalanceToolTest {

    @Mock private FinAccountService finAccountService;
    private final ObjectMapper mapper = new ObjectMapper();

    private QueryAccountBalanceTool newTool() { return new QueryAccountBalanceTool(finAccountService, mapper); }

    @Test
    void emptyResultMessageShortCircuits() {
        when(finAccountService.page(any())).thenReturn(new PageResult<>(List.of(), 0L));
        String out = newTool().execute(Map.of(), new AgentTool.ToolCallContext("alice", null));
        assertTrue(out.contains("未找到符合條件的賬戶"));
        assertTrue(out.contains("\"total\":0"));
    }

    @Test
    void passesGroupNameAndBrandToService() {
        when(finAccountService.page(any())).thenReturn(new PageResult<>(List.of(), 0L));
        newTool().execute(Map.of("groupName", "苹果", "brand", "1"),
                new AgentTool.ToolCallContext("alice", null));
        ArgumentCaptor<FinAccountQuery> cap = ArgumentCaptor.forClass(FinAccountQuery.class);
        verify(finAccountService).page(cap.capture());
        assertEquals("苹果", cap.getValue().getGroupName());
        assertEquals("1", cap.getValue().getBrand());
        assertEquals(10L, cap.getValue().getSize());
    }

    @Test
    void mapsFlashBeeAndMfoodBrandsToChineseLabels() {
        FinAccountVO vo = new FinAccountVO();
        vo.setGroupName("A"); vo.setGroupId("G1"); vo.setBrand("flashBee");
        vo.setVirtualBalance(new BigDecimal("100")); vo.setActualBalance(new BigDecimal("200"));
        vo.setStatus("frozen");
        when(finAccountService.page(any())).thenReturn(new PageResult<>(List.of(vo), 1L));
        String out = newTool().execute(Map.of(), new AgentTool.ToolCallContext("bob", null));
        assertTrue(out.contains("閃蜂"));
        assertTrue(out.contains("凍結"));
    }

    @Test
    void serviceFailureReturnsErrorJsonNotThrow() {
        when(finAccountService.page(any())).thenThrow(new RuntimeException("DB 挂了"));
        String out = newTool().execute(Map.of(), new AgentTool.ToolCallContext("bob", null));
        assertTrue(out.startsWith("{\"error\":"));
        assertTrue(out.contains("DB 挂了"));
    }
}

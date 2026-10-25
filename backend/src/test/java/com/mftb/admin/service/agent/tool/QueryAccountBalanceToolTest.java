package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinAccountService;
import org.junit.jupiter.api.DisplayName;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * query_account_balance 的取数与品牌口径。
 * <p>品牌这条是深度测试实测暴露的线上缺陷：库里 {@code biz_fin_account.brand} 存
 * {@code flashBee} / {@code mFood}，而旧工具 schema 告诉模型「1=閃蜂, 2=mFood」。模型于是传
 * "2"/"mFood"/中文名，过滤条件与库值永远对不上 → 明明有 4 条 mFood 余额，AI 却回答
 * 「未找到符合條件的數據」。也不能「识别不了就当没传」：那会把全量结果当成该品牌的结果
 * 交给模型，属于编造数据，比查不到更危险。
 */
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
        // 品牌口径变更：模型传 "1" 也必须归一化成库内取值 flashBee，否则过滤恒空
        assertEquals("flashBee", cap.getValue().getBrand());
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
    void serviceFailureReturnsErrorJsonWithoutInternalDetail() {
        when(finAccountService.page(any())).thenThrow(new RuntimeException("DB 挂了"));
        String out = newTool().execute(Map.of(), new AgentTool.ToolCallContext("bob", null));
        assertTrue(out.startsWith("{\"error\":"));
        assertFalse(out.contains("DB 挂了"), "不得把内部异常文本回给模型");
    }

    @Test
    @DisplayName("品牌别名归一化：1/2、中文名、大小写与空格都映射到库内取值")
    void normalizesBrandAliases() {
        assertEquals("flashBee", QueryAccountBalanceTool.normalizeBrand("1"));
        assertEquals("mFood", QueryAccountBalanceTool.normalizeBrand("2"));
        assertEquals("mFood", QueryAccountBalanceTool.normalizeBrand(" MFOOD "));
        assertEquals("mFood", QueryAccountBalanceTool.normalizeBrand("m_food"));
        assertEquals("flashBee", QueryAccountBalanceTool.normalizeBrand("閃蜂"));
        assertEquals("flashBee", QueryAccountBalanceTool.normalizeBrand("闪蜂"));
        assertEquals("flashBee", QueryAccountBalanceTool.normalizeBrand("flashBee"));
        assertNull(QueryAccountBalanceTool.normalizeBrand("unknown-brand"));
        assertNull(QueryAccountBalanceTool.normalizeBrand(null));
    }

    @Test
    @DisplayName("schema 的 brand enum 必须是库内实际取值")
    @SuppressWarnings("unchecked")
    void schemaEnumMatchesDbValues() {
        var props = (Map<String, Object>) newTool().schema().get("properties");
        var brand = (Map<String, Object>) props.get("brand");
        assertEquals(List.of("flashBee", "mFood"), brand.get("enum"));
    }

    @Test
    @DisplayName("模型直接传中文品牌名时，下发的是归一化后的库值")
    void passesNormalizedBrand() {
        when(finAccountService.page(any())).thenReturn(new PageResult<>(List.of(), 0L));

        newTool().execute(Map.of("brand", "mFood"), new AgentTool.ToolCallContext("MF00001", null));

        ArgumentCaptor<FinAccountQuery> cap = ArgumentCaptor.forClass(FinAccountQuery.class);
        verify(finAccountService).page(cap.capture());
        assertEquals("mFood", cap.getValue().getBrand());
    }

    @Test
    @DisplayName("无法识别的品牌取值：不下发查询、明确返回可选值")
    void rejectsUnknownBrandInsteadOfIgnoringFilter() throws Exception {
        String json = newTool().execute(Map.of("brand", "特斯拉"),
                new AgentTool.ToolCallContext("MF00001", null));

        verify(finAccountService, never()).page(any());
        var node = mapper.readTree(json);
        assertTrue(node.path("error").asText().length() > 0, "应带错误说明: " + json);
        assertEquals(2, node.path("allowedValues").size());
    }
}

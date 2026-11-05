/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 */
package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.dto.AdPricingSignboardVO;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdPricingHot;
import com.mftb.admin.entity.AdPricingSignboard;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemHotMapper;
import com.mftb.admin.mapper.AdOrderItemNewStoreMapper;
import com.mftb.admin.mapper.AdOrderItemReviveMapper;
import com.mftb.admin.mapper.AdOrderItemSignboardMapper;
import com.mftb.admin.mapper.AdOrderItemTimeSlotMapper;
import com.mftb.admin.mapper.AdOrderItemStarMapper;
import com.mftb.admin.mapper.AdOrderItemTrafficMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.AdPricingHotMapper;
import com.mftb.admin.mapper.AdPricingHotSkinMapper;
import com.mftb.admin.mapper.AdPricingSignboardLabelMapper;
import com.mftb.admin.mapper.AdPricingSignboardMapper;
import com.mftb.admin.mapper.AdPricingTrafficMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.impl.AdOrderServiceImpl;
import com.mftb.admin.service.impl.AdPricingHotServiceImpl;
import com.mftb.admin.service.impl.AdPricingSignboardServiceImpl;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 订单回查定价的 ID 语义锚点测试（人气商家 / 金字招牌）。
 * <p>
 * 背景：这两类订单的 {@code biz_ad_order.algo_id} 存的是**定价配置主键**（解耦后口径，与投流广告一致），
 * 不是算法表主键。历史上退款配置解析把它们当算法ID去查 {@code algo_id} 维度，永远查不到配置，
 * 导致「取消扣费梯度」静默丢失（按 0% 手续费全额退款）；同时订单列表的 algo_code 通用回填
 * 会拿定价ID去撞算法表主键（两表ID区间重叠），可能贴出无关算法的编号。
 */
@DisplayName("广告订单: 人气商家/金字招牌按定价配置ID回查")
class AdOrderPricingIdSemanticsTest {

    /** 定价表与算法表主键区间重叠（algorithm 3..106 / pricing_hot 89..95），89 是最典型的踩坑值 */
    private static final long PRICING_ID = 89L;

    @Test
    @DisplayName("人气商家退款配置按定价主键回查，不再走算法ID维度")
    void hotRefundConfigLooksUpPricingById() throws Exception {
        AdPricingHotService hotPricingService = mock(AdPricingHotService.class);
        AdPricingHotVO pricing = new AdPricingHotVO();
        pricing.setRefundEnabled(1);
        pricing.setCancelFeeTiers("[{\"maxDays\":3,\"feePercent\":20}]");
        when(hotPricingService.detailOrNull(PRICING_ID)).thenReturn(pricing);

        Object config = resolveRefundConfig(hotOrder(), hotPricingService, mock(AdPricingSignboardService.class));

        verify(hotPricingService).detailOrNull(PRICING_ID);
        verify(hotPricingService, never()).activeByAlgo(any());
        assertEquals(1, invokeInt(config, "refundEnabled"));
        assertEquals("[{\"maxDays\":3,\"feePercent\":20}]", invokeString(config, "cancelFeeTiersJson"));
    }

    @Test
    @DisplayName("金字招牌退款配置按定价主键回查，不再走算法ID维度")
    void signboardRefundConfigLooksUpPricingById() throws Exception {
        AdPricingSignboardService signboardPricingService = mock(AdPricingSignboardService.class);
        AdPricingSignboardVO pricing = new AdPricingSignboardVO();
        pricing.setRefundEnabled(2);
        pricing.setCancelFeeTiers("[{\"maxDays\":1,\"feePercent\":30}]");
        when(signboardPricingService.detailOrNull(PRICING_ID)).thenReturn(pricing);

        Object config = resolveRefundConfig(signboardOrder(), mock(AdPricingHotService.class), signboardPricingService);

        verify(signboardPricingService).detailOrNull(PRICING_ID);
        verify(signboardPricingService, never()).activeByAlgo(any());
        assertEquals(2, invokeInt(config, "refundEnabled"));
        assertEquals("[{\"maxDays\":1,\"feePercent\":30}]", invokeString(config, "cancelFeeTiersJson"));
    }

    @Test
    @DisplayName("detailOrNull 按主键取配置：命中返回详情，缺失返回 null 而非抛错")
    void detailOrNullUsesPrimaryKeyAndToleratesMissing() {
        AdPricingHotMapper hotMapper = mock(AdPricingHotMapper.class);
        AdPricingHot row = new AdPricingHot();
        row.setId(PRICING_ID);
        row.setPricingNo("DJRQ20260813000");
        when(hotMapper.selectById(PRICING_ID)).thenReturn(row);
        when(hotMapper.selectList(any())).thenReturn(List.of());
        AdPricingHotService hotService = new AdPricingHotServiceImpl(
                hotMapper, mock(OperatorResolver.class), mock(AdPricingHotSkinMapper.class), mock(BizSeqService.class));

        AdPricingHotVO found = hotService.detailOrNull(PRICING_ID);
        assertNotNull(found);
        assertEquals("DJRQ20260813000", found.getPricingNo());
        assertNull(hotService.detailOrNull(null));

        AdPricingSignboardMapper signMapper = mock(AdPricingSignboardMapper.class);
        AdPricingSignboard signRow = new AdPricingSignboard();
        signRow.setId(PRICING_ID);
        signRow.setPricingNo("DJZP20260909000");
        when(signMapper.selectById(PRICING_ID)).thenReturn(signRow);
        when(signMapper.selectList(any())).thenReturn(List.of());
        AdPricingSignboardService signService = new AdPricingSignboardServiceImpl(
                signMapper, mock(OperatorResolver.class), mock(AdPricingSignboardLabelMapper.class), mock(BizSeqService.class));

        AdPricingSignboardVO signFound = signService.detailOrNull(PRICING_ID);
        assertNotNull(signFound);
        assertEquals("DJZP20260909000", signFound.getPricingNo());
        assertNull(signService.detailOrNull(null));
    }

    private static AdOrder hotOrder() {
        return order(5);
    }

    private static AdOrder signboardOrder() {
        return order(13);
    }

    private static AdOrder order(int algoType) {
        AdOrder order = new AdOrder();
        order.setId(1L);
        order.setOrderNo("DDRQ202608180000");
        order.setAlgoType(algoType);
        order.setAlgoId(PRICING_ID);
        order.setRefundEnabled(null);
        return order;
    }

    /** resolveRefundConfig 是私有实现细节，但它的入参语义正是本测试要钉住的回归点 */
    private static Object resolveRefundConfig(AdOrder order,
                                              AdPricingHotService hotPricingService,
                                              AdPricingSignboardService signboardPricingService) throws Exception {
        AdOrderServiceImpl service = new AdOrderServiceImpl(
                mock(AdOrderMapper.class), mock(AdOrderItemStarMapper.class), mock(AdCellQuotaService.class),
                mock(AdOrderItemReviveMapper.class), mock(AdOrderItemNewStoreMapper.class), mock(AdOrderItemHotMapper.class),
                mock(AdOrderItemSignboardMapper.class), mock(AdOrderItemTimeSlotMapper.class), mock(AdOrderItemTrafficMapper.class), mock(AdAlgorithmMapper.class),
                mock(AdPricingHotMapper.class), mock(AdPricingHotSkinMapper.class), mock(AdPricingSignboardMapper.class),
                mock(AdPricingTrafficMapper.class), mock(FinDetailMapper.class), mock(AdPricingStarService.class),
                mock(AdPricingReviveService.class), hotPricingService, signboardPricingService,
                mock(AdPricingTimeSlotService.class),
                mock(FinAccountService.class), mock(FinWriteChainService.class), mock(BizSeqService.class),
                mock(OperatorResolver.class), mock(DataScopeService.class), mock(BizStoreMapper.class));

        Method method = AdOrderServiceImpl.class.getDeclaredMethod("resolveRefundConfig", AdOrder.class);
        method.setAccessible(true);
        Object config = method.invoke(service, order);
        assertNotNull(config);
        return config;
    }

    private static int invokeInt(Object config, String accessor) throws Exception {
        Method method = config.getClass().getDeclaredMethod(accessor);
        method.setAccessible(true);
        Object value = method.invoke(config);
        return value == null ? -1 : (int) value;
    }

    private static String invokeString(Object config, String accessor) throws Exception {
        Method method = config.getClass().getDeclaredMethod(accessor);
        method.setAccessible(true);
        return (String) method.invoke(config);
    }
}

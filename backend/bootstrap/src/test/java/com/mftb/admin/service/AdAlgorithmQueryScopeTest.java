/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdAlgorithmQuery;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdWaterfallMapper;
import com.mftb.admin.mapper.AdWaterfallRecommendationMapper;
import com.mftb.admin.mapper.AdWaterfallSlotMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.impl.AdAlgorithmServiceImpl;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * type17 的查询隔离：未声明用途的旧消费者与坑位/销售场景不得拿到交互式相似推荐；
 * 业务范围筛选对 type17 只认参数内 applicableBusinessTypes，不走旧频道推断。
 */
class AdAlgorithmQueryScopeTest {

    // LambdaQueryWrapper 依赖 MyBatis-Plus 的实体 lambda 缓存；单测无 Spring 容器，需手动初始化表信息。
    static {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), AdAlgorithm.class);
    }

    private final AdAlgorithmMapper algorithmMapper = mock(AdAlgorithmMapper.class);
    private final AdWaterfallRecommendationMapper recommendationMapper = mock(AdWaterfallRecommendationMapper.class);
    private final AdAlgorithmServiceImpl service = new AdAlgorithmServiceImpl(
            algorithmMapper, mock(AdWaterfallSlotMapper.class), mock(AdWaterfallMapper.class),
            recommendationMapper,
            mock(AdPricingStarService.class), mock(AdPricingReviveService.class), mock(AdPricingHotService.class),
            mock(AdPricingSignboardService.class), mock(AdPricingTrafficService.class),
            mock(BizStoreMapper.class), mock(BizMerchantGroupMapper.class),
            mock(OperatorResolver.class), mock(BizSeqService.class));

    /** 返回本次查询 wrapper 的 SQL 片段；type17 排除体现为第二处 algo_type <>（星星商品排除为第一处）。 */
    private String segmentOf(AdAlgorithmQuery query) {
        when(algorithmMapper.selectPage(any(), any())).thenReturn(new Page<>(1, 10));
        service.query(query);
        ArgumentCaptor<LambdaQueryWrapper<AdAlgorithm>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        org.mockito.Mockito.verify(algorithmMapper, org.mockito.Mockito.atLeastOnce()).selectPage(any(), captor.capture());
        return captor.getValue().getSqlSegment();
    }

    private static int countExclusions(String segment) {
        return segment.split("algo_type <>", -1).length - 1;
    }

    @Test
    void oldConsumersNeverSeeType17() {
        assertEquals(2, countExclusions(segmentOf(new AdAlgorithmQuery())));
        AdAlgorithmQuery slot = new AdAlgorithmQuery();
        slot.setUsage("slot");
        assertEquals(2, countExclusions(segmentOf(slot)));
        AdAlgorithmQuery sales = new AdAlgorithmQuery();
        sales.setUsage("sales");
        assertEquals(2, countExclusions(segmentOf(sales)));
    }

    @Test
    void libraryAndScenarioUsageKeepType17AndRejectUnknownUsage() {
        AdAlgorithmQuery library = new AdAlgorithmQuery();
        library.setUsage("library");
        assertEquals(1, countExclusions(segmentOf(library)));
        AdAlgorithmQuery scenario = new AdAlgorithmQuery();
        scenario.setUsage("scenario");
        assertEquals(1, countExclusions(segmentOf(scenario)));
        AdAlgorithmQuery bogus = new AdAlgorithmQuery();
        bogus.setUsage("whatever");
        assertEquals(422, assertThrows(BusinessException.class, () -> service.query(bogus)).getCode());
    }

    @Test
    void businessFilterReadsType17ScopeFromParamsNotLegacyChannel() {
        AdAlgorithmQuery query = new AdAlgorithmQuery();
        query.setUsage("library");
        query.setBusinessType(2);
        String sql = segmentOf(query);
        assertTrue(sql.contains("applicableBusinessTypes"));
        assertTrue(sql.contains("algo_type ="));
    }

    @Test
    void deleteIsBlockedWhileSceneBindingReferencesAlgorithm() {
        when(recommendationMapper.selectCount(any())).thenReturn(1L);
        AdAlgorithm algorithm = new AdAlgorithm();
        algorithm.setId(17L);
        algorithm.setAlgoType(17);
        algorithm.setAlgoCode("SFJH0001");
        when(algorithmMapper.selectOne(any())).thenReturn(algorithm);
        BusinessException error = assertThrows(BusinessException.class, () -> service.delete(17L));
        assertTrue(error.getMessage().contains("相似推薦"));
        org.mockito.Mockito.verify(algorithmMapper, org.mockito.Mockito.never()).deleteById(any(Long.class));
    }
}

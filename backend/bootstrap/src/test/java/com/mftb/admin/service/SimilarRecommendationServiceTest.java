/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdWaterfallRecommendationRequest;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdAlgorithmRevision;
import com.mftb.admin.entity.AdWaterfall;
import com.mftb.admin.entity.AdWaterfallRecommendation;
import com.mftb.admin.entity.AdWaterfallRecommendationTraffic;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdAlgorithmRevisionMapper;
import com.mftb.admin.mapper.AdWaterfallMapper;
import com.mftb.admin.mapper.AdWaterfallRecommendationMapper;
import com.mftb.admin.mapper.AdWaterfallRecommendationTrafficMapper;
import com.mftb.admin.service.impl.AdAlgorithmRevisionServiceImpl;
import com.mftb.admin.service.impl.AdWaterfallRecommendationServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 版本发布与场景绑定的服务端裁决：类型、品牌、业务范围、候选集合与乐观锁都不可被客户端绕过。 */
class SimilarRecommendationServiceTest {

    private final AdAlgorithmMapper algorithmMapper = mock(AdAlgorithmMapper.class);
    private final AdAlgorithmRevisionMapper revisionMapper = mock(AdAlgorithmRevisionMapper.class);
    private final AdWaterfallMapper waterfallMapper = mock(AdWaterfallMapper.class);
    private final AdWaterfallRecommendationMapper recommendationMapper = mock(AdWaterfallRecommendationMapper.class);
    private final AdWaterfallRecommendationTrafficMapper trafficMapper = mock(AdWaterfallRecommendationTrafficMapper.class);
    private final OperatorResolver operatorResolver = mock(OperatorResolver.class);
    private final AdAlgorithmRevisionServiceImpl revisionService =
            new AdAlgorithmRevisionServiceImpl(algorithmMapper, revisionMapper, operatorResolver);
    private final AdWaterfallRecommendationServiceImpl recommendationService =
            new AdWaterfallRecommendationServiceImpl(waterfallMapper, recommendationMapper, trafficMapper,
                    revisionMapper, algorithmMapper, operatorResolver);

    private static AdAlgorithm algorithm(long id, int type, String brand, int status) {
        AdAlgorithm algorithm = new AdAlgorithm();
        algorithm.setId(id);
        algorithm.setAlgoType(type);
        algorithm.setBrand(brand);
        algorithm.setStatus(status);
        algorithm.setAlgoName("algo-" + id);
        return algorithm;
    }

    private static String similarParams() {
        return "{\"schemaVersion\":1,\"targetType\":1,\"applicableBusinessTypes\":[1],\"supportedScenes\":[1],"
                + "\"tagPolicy\":{\"merchantMinimum\":50,\"userMinimum\":10},"
                + "\"similarRules\":{\"metric\":\"cosine\",\"merchantSimilarityThreshold\":60,"
                + "\"modes\":[\"merchantSimilar\"],\"resultCount\":1,\"slot1Source\":\"merchantSimilar\","
                + "\"slot2Source\":\"merchantSimilar\",\"triggerMode\":\"instant\",\"dailyLimitMode\":\"unlimited\","
                + "\"merchantFreqHours\":2,\"merchantFreqTimes\":1,\"rankPreset\":\"matchFirst\",\"rankTieBreak\":\"storeId\"}}";
    }

    @Test
    void publishRejectsNonSimilarAlgorithm() {
        when(algorithmMapper.selectOne(any())).thenReturn(algorithm(15L, 15, "flashBee", 1));
        BusinessException error = assertThrows(BusinessException.class, () -> revisionService.publish(15L, null));
        assertEquals(422, error.getCode());
        verify(revisionMapper, never()).insert(any(AdAlgorithmRevision.class));
    }

    @Test
    void publishAssignsNextRevisionAndDetectsConflict() {
        AdAlgorithm algorithm = algorithm(17L, 17, "flashBee", 1);
        algorithm.setParams(similarParams());
        when(algorithmMapper.selectOne(any())).thenReturn(algorithm);
        when(revisionMapper.selectOne(any())).thenReturn(null);
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
        assertEquals(1, revisionService.publish(17L, null).getRevision());
        ArgumentCaptor<AdAlgorithmRevision> captor = ArgumentCaptor.forClass(AdAlgorithmRevision.class);
        verify(revisionMapper).insert(captor.capture());
        assertEquals(1, captor.getValue().getRevision());
        assertEquals(64, captor.getValue().getContentHash().length());

        AdAlgorithmRevision latest = new AdAlgorithmRevision();
        latest.setRevision(1);
        when(revisionMapper.selectOne(any())).thenReturn(latest);
        assertEquals(409, assertThrows(BusinessException.class, () -> revisionService.publish(17L, 0)).getCode());
        assertEquals(2, revisionService.publish(17L, 1).getRevision());
    }

    private AdWaterfallRecommendationRequest request(int scope, List<Long> traffic) {
        AdWaterfallRecommendationRequest request = new AdWaterfallRecommendationRequest();
        request.setSceneCode(1);
        request.setAlgorithmRevisionId(91L);
        request.setEnabled(1);
        request.setCandidateScope(scope);
        request.setBusinessType(1);
        request.setBizChannel(1);
        request.setTrafficAlgorithmIds(traffic);
        return request;
    }

    private void stubHappyPath(String brand) {
        AdWaterfall waterfall = new AdWaterfall();
        waterfall.setId(5L);
        waterfall.setBrand(brand);
        when(waterfallMapper.selectOne(any())).thenReturn(waterfall);
        when(recommendationMapper.selectOne(any())).thenReturn(null);
        AdAlgorithmRevision revision = new AdAlgorithmRevision();
        revision.setId(91L);
        revision.setAlgorithmId(17L);
        revision.setRevision(1);
        revision.setParamsSnapshot(similarParams());
        when(revisionMapper.selectById(91L)).thenReturn(revision);
        when(algorithmMapper.selectById(17L)).thenReturn(algorithm(17L, 17, brand, 1));
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
    }

    @Test
    void putRejectsReservedSceneAndVersionConflict() {
        stubHappyPath("flashBee");
        AdWaterfallRecommendationRequest reserved = request(1, List.of());
        reserved.setSceneCode(2);
        assertEquals(422, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, reserved)).getCode());
        AdWaterfallRecommendationRequest conflicted = request(1, List.of());
        conflicted.setExpectedVersion(3L);
        assertEquals(409, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, conflicted)).getCode());
        verify(recommendationMapper, never()).insert(any(AdWaterfallRecommendation.class));
    }

    @Test
    void putValidatesBrandScopeAndTrafficSet() {
        stubHappyPath("flashBee");
        when(algorithmMapper.selectById(17L)).thenReturn(algorithm(17L, 17, "mFood", 1));
        assertEquals(422, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, request(1, List.of()))).getCode());

        stubHappyPath("flashBee");
        assertEquals(422, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, request(2, List.of()))).getCode());
        when(algorithmMapper.selectById(21L)).thenReturn(algorithm(21L, 1, "flashBee", 1));
        assertEquals(422, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, request(2, List.of(21L)))).getCode());
        when(algorithmMapper.selectById(22L)).thenReturn(algorithm(22L, 15, "flashBee", 2));
        assertEquals(422, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, request(2, List.of(22L)))).getCode());

        stubHappyPath("flashBee");
        when(algorithmMapper.selectById(17L)).thenReturn(algorithm(17L, 17, "flashBee", 2));
        assertEquals(422, assertThrows(BusinessException.class,
                () -> recommendationService.put(5L, request(1, List.of()))).getCode());
    }

    @Test
    void putPersistsBindingAndReplacesTrafficSet() {
        stubHappyPath("flashBee");
        when(algorithmMapper.selectById(23L)).thenReturn(algorithm(23L, 15, "flashBee", 1));
        recommendationService.put(5L, request(2, List.of(23L)));
        ArgumentCaptor<AdWaterfallRecommendation> captor = ArgumentCaptor.forClass(AdWaterfallRecommendation.class);
        verify(recommendationMapper).insert(captor.capture());
        assertEquals(1L, captor.getValue().getVersion());
        assertEquals(2, captor.getValue().getCandidateScope());
        verify(trafficMapper).delete(any(Wrapper.class));
        verify(trafficMapper).insert(any(AdWaterfallRecommendationTraffic.class));
    }

    @Test
    void getReturnsEmptyBindingWhenUnconfigured() {
        when(recommendationMapper.selectOne(any())).thenReturn(null);
        assertEquals(false, recommendationService.get(5L).isConfigured());
        assertEquals(0, recommendationService.get(5L).getEnabled());
    }

    @Test
    void deleteGuardCountsBindings() {
        when(recommendationMapper.selectCount(any())).thenReturn(1L);
        assertEquals(true, recommendationService.isReferenced(17L));
        when(recommendationMapper.selectCount(any())).thenReturn(0L);
        assertEquals(false, recommendationService.isReferenced(17L));
    }

    @Test
    void paramsSnapshotMapRoundTrip() {
        Map<String, Object> params = com.mftb.admin.service.support.AdSimilarAlgorithmParams.read(similarParams());
        assertEquals(List.of(1), params.get("applicableBusinessTypes"));
        assertEquals(1, ((Map<String, Object>) params.get("similarRules")).get("resultCount"));
    }
}

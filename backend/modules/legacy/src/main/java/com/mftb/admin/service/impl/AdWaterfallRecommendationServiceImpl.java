/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdWaterfallRecommendationRequest;
import com.mftb.admin.dto.AdWaterfallRecommendationVO;
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
import com.mftb.admin.service.AdWaterfallRecommendationService;
import com.mftb.admin.service.support.AdSimilarAlgorithmParams;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 瀑布流相似推荐场景绑定服务实现。
 * <p>业务范围与品牌由服务端对照算法版本快照和瀑布流复核，不接受客户端自报即真；
 * 启用态额外要求算法可用，避免绑定一条已停用的算法产生空决策。
 */
@Service
@RequiredArgsConstructor
public class AdWaterfallRecommendationServiceImpl implements AdWaterfallRecommendationService {

    private final AdWaterfallMapper waterfallMapper;
    private final AdWaterfallRecommendationMapper recommendationMapper;
    private final AdWaterfallRecommendationTrafficMapper trafficMapper;
    private final AdAlgorithmRevisionMapper revisionMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public AdWaterfallRecommendationVO get(Long waterfallId) {
        AdWaterfallRecommendation binding = findBinding(waterfallId);
        if (binding == null) return AdWaterfallRecommendationVO.empty(waterfallId);
        AdWaterfallRecommendationVO vo = toVO(binding);
        vo.setTrafficAlgorithmIds(trafficIds(binding.getId()));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdWaterfallRecommendationVO put(Long waterfallId, AdWaterfallRecommendationRequest request) {
        if (!Objects.equals(request.getSceneCode(), AdSimilarAlgorithmParams.SCENE_DETAIL_RETURN)) {
            throw new BusinessException(422, "首期僅開放詳情返回場景");
        }
        AdWaterfall waterfall = waterfallMapper.selectOne(new LambdaQueryWrapper<AdWaterfall>()
                .eq(AdWaterfall::getId, waterfallId).last("FOR UPDATE"));
        if (waterfall == null) throw new BusinessException("瀑布流策略不存在");
        AdWaterfallRecommendation existing = findBinding(waterfallId);
        if (existing == null ? request.getExpectedVersion() != null
                : !Objects.equals(existing.getVersion(), request.getExpectedVersion())) {
            throw new BusinessException(409, "綁定已被修改，請重新載入後再保存");
        }
        AdWaterfallRecommendation binding = existing == null ? new AdWaterfallRecommendation() : existing;
        Long revisionId = request.getAlgorithmRevisionId();
        if (revisionId == null && request.getAlgorithmId() != null) {
            // 服务端解析最新已发布版本（2026-11-25 绑定简化）：客户端只选算法实例，
            // 版本归属由服务端裁决，避免客户端缓存的版本列表与服务端漂移。
            AdAlgorithmRevision latest = revisionMapper.selectOne(new LambdaQueryWrapper<AdAlgorithmRevision>()
                    .eq(AdAlgorithmRevision::getAlgorithmId, request.getAlgorithmId())
                    .orderByDesc(AdAlgorithmRevision::getRevision)
                    .last("LIMIT 1"));
            if (latest == null) throw new BusinessException(422, "所選算法尚未發布版本，請先在算法庫發布新版本");
            revisionId = latest.getId();
        }
        if (revisionId == null) revisionId = binding.getAlgorithmRevisionId();
        if (revisionId == null) throw new BusinessException(422, "請先選擇相似推薦算法版本");
        AdAlgorithmRevision revision = revisionMapper.selectById(revisionId);
        if (revision == null) throw new BusinessException(422, "算法版本不存在");
        AdAlgorithm algorithm = algorithmMapper.selectById(revision.getAlgorithmId());
        if (algorithm == null || !AdSimilarAlgorithmParams.isSimilarType(algorithm.getAlgoType())) {
            throw new BusinessException(422, "綁定必須引用交互式相似推薦算法版本");
        }
        if (StringUtils.hasText(algorithm.getBrand()) && StringUtils.hasText(waterfall.getBrand())
                && !algorithm.getBrand().equals(waterfall.getBrand())) {
            throw new BusinessException(422, "算法品牌與瀑布流品牌不一致");
        }
        if (Objects.equals(request.getEnabled(), 1) && !Objects.equals(algorithm.getStatus(), 1)) {
            throw new BusinessException(422, "算法已停用，不能啟用綁定");
        }
        Map<String, Object> params = AdSimilarAlgorithmParams.validate(AdSimilarAlgorithmParams.read(revision.getParamsSnapshot()));
        Object businesses = params.get("applicableBusinessTypes");
        if (!(businesses instanceof List<?> list) || !list.contains(request.getBusinessType())) {
            throw new BusinessException(422, "算法適用範圍不包含該業務類型");
        }
        List<Long> trafficIds = request.getTrafficAlgorithmIds() == null
                ? List.of() : request.getTrafficAlgorithmIds().stream().filter(Objects::nonNull).distinct().toList();
        if (Objects.equals(request.getCandidateScope(), 2)) {
            if (trafficIds.isEmpty()) throw new BusinessException(422, "僅投流候選必須配置允許的投流算法");
            for (Long trafficId : trafficIds) {
                AdAlgorithm traffic = algorithmMapper.selectById(trafficId);
                if (traffic == null || !Objects.equals(traffic.getAlgoType(), 15)) {
                    throw new BusinessException(422, "允許集合只能包含投流廣告算法");
                }
                if (!Objects.equals(traffic.getStatus(), 1)) {
                    throw new BusinessException(422, "允許集合包含已停用的投流算法");
                }
                if (StringUtils.hasText(traffic.getBrand()) && StringUtils.hasText(waterfall.getBrand())
                        && !traffic.getBrand().equals(waterfall.getBrand())) {
                    throw new BusinessException(422, "允許集合包含其他品牌的投流算法");
                }
            }
        }
        binding.setWaterfallId(waterfallId);
        binding.setSceneCode(request.getSceneCode());
        binding.setAlgorithmId(algorithm.getId());
        binding.setAlgorithmRevisionId(revisionId);
        binding.setEnabled(request.getEnabled());
        binding.setCandidateScope(request.getCandidateScope());
        binding.setBusinessType(request.getBusinessType());
        binding.setBizChannel(request.getBizChannel());
        binding.setVersion((existing == null ? 0L : existing.getVersion()) + 1);
        binding.setUpdatedBy(operatorResolver.currentOperatorName());
        if (existing == null) recommendationMapper.insert(binding);
        else recommendationMapper.updateById(binding);
        trafficMapper.delete(new LambdaQueryWrapper<AdWaterfallRecommendationTraffic>()
                .eq(AdWaterfallRecommendationTraffic::getBindingId, binding.getId()));
        for (Long trafficId : trafficIds) {
            AdWaterfallRecommendationTraffic child = new AdWaterfallRecommendationTraffic();
            child.setBindingId(binding.getId());
            child.setTrafficAlgorithmId(trafficId);
            trafficMapper.insert(child);
        }
        AdWaterfallRecommendationVO vo = toVO(binding);
        vo.setTrafficAlgorithmIds(trafficIds);
        vo.setRevisionNo(revision.getRevision());
        vo.setAlgorithmName(algorithm.getAlgoName());
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteByWaterfall(Long waterfallId) {
        AdWaterfallRecommendation binding = findBinding(waterfallId);
        if (binding == null) return;
        trafficMapper.delete(new LambdaQueryWrapper<AdWaterfallRecommendationTraffic>()
                .eq(AdWaterfallRecommendationTraffic::getBindingId, binding.getId()));
        recommendationMapper.deleteById(binding.getId());
    }

    @Override
    public boolean isReferenced(Long algorithmId) {
        Long count = recommendationMapper.selectCount(new LambdaQueryWrapper<AdWaterfallRecommendation>()
                .eq(AdWaterfallRecommendation::getAlgorithmId, algorithmId));
        return count != null && count > 0;
    }

    private AdWaterfallRecommendation findBinding(Long waterfallId) {
        return recommendationMapper.selectOne(new LambdaQueryWrapper<AdWaterfallRecommendation>()
                .eq(AdWaterfallRecommendation::getWaterfallId, waterfallId)
                .eq(AdWaterfallRecommendation::getSceneCode, AdSimilarAlgorithmParams.SCENE_DETAIL_RETURN)
                .last("LIMIT 1"));
    }

    private List<Long> trafficIds(Long bindingId) {
        return trafficMapper.selectList(new LambdaQueryWrapper<AdWaterfallRecommendationTraffic>()
                        .eq(AdWaterfallRecommendationTraffic::getBindingId, bindingId))
                .stream().map(AdWaterfallRecommendationTraffic::getTrafficAlgorithmId).toList();
    }

    private AdWaterfallRecommendationVO toVO(AdWaterfallRecommendation binding) {
        AdWaterfallRecommendationVO vo = new AdWaterfallRecommendationVO();
        vo.setConfigured(true);
        vo.setId(binding.getId());
        vo.setWaterfallId(binding.getWaterfallId());
        vo.setSceneCode(binding.getSceneCode());
        vo.setAlgorithmId(binding.getAlgorithmId());
        vo.setAlgorithmRevisionId(binding.getAlgorithmRevisionId());
        vo.setEnabled(binding.getEnabled());
        vo.setCandidateScope(binding.getCandidateScope());
        vo.setBusinessType(binding.getBusinessType());
        vo.setBizChannel(binding.getBizChannel());
        vo.setVersion(binding.getVersion());
        vo.setUpdatedBy(binding.getUpdatedBy());
        vo.setUpdatedAt(binding.getUpdatedAt());
        AdAlgorithmRevision revision = revisionMapper.selectById(binding.getAlgorithmRevisionId());
        if (revision != null) {
            vo.setRevisionNo(revision.getRevision());
            AdAlgorithm algorithm = algorithmMapper.selectById(revision.getAlgorithmId());
            if (algorithm != null) vo.setAlgorithmName(algorithm.getAlgoName());
        }
        return vo;
    }
}

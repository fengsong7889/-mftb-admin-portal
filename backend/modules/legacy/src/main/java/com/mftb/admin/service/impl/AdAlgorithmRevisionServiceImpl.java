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
import com.mftb.admin.dto.AdAlgorithmRevisionVO;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdAlgorithmRevision;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdAlgorithmRevisionMapper;
import com.mftb.admin.service.AdAlgorithmRevisionService;
import com.mftb.admin.service.support.AdSimilarAlgorithmParams;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 算法不可变版本服务实现。
 * <p>版本号在算法主记录行锁内分配，避免并发发布产生重复版本；快照只插不改。
 */
@Service
@RequiredArgsConstructor
public class AdAlgorithmRevisionServiceImpl implements AdAlgorithmRevisionService {

    private final AdAlgorithmMapper algorithmMapper;
    private final AdAlgorithmRevisionMapper revisionMapper;
    private final OperatorResolver operatorResolver;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdAlgorithmRevisionVO publish(Long algorithmId, Integer expectedRevision) {
        AdAlgorithm algorithm = algorithmMapper.selectOne(new LambdaQueryWrapper<AdAlgorithm>()
                .eq(AdAlgorithm::getId, algorithmId).last("FOR UPDATE"));
        if (algorithm == null) throw new BusinessException("算法不存在");
        if (!AdSimilarAlgorithmParams.isSimilarType(algorithm.getAlgoType())) {
            throw new BusinessException(422, "僅交互式相似推薦算法可發布不可變版本");
        }
        Map<String, Object> params = AdSimilarAlgorithmParams.validate(AdSimilarAlgorithmParams.read(algorithm.getParams()));
        AdAlgorithmRevision latest = revisionMapper.selectOne(new LambdaQueryWrapper<AdAlgorithmRevision>()
                .eq(AdAlgorithmRevision::getAlgorithmId, algorithmId)
                .orderByDesc(AdAlgorithmRevision::getRevision).last("LIMIT 1"));
        int current = latest == null ? 0 : latest.getRevision();
        if (expectedRevision != null && expectedRevision != current) {
            throw new BusinessException(409, "配置已被修改，請重新載入後再發布");
        }
        AdAlgorithmRevision entity = new AdAlgorithmRevision();
        entity.setAlgorithmId(algorithmId);
        entity.setRevision(current + 1);
        entity.setSchemaVersion(AdSimilarAlgorithmParams.SCHEMA_VERSION);
        entity.setParamsSnapshot(AdSimilarAlgorithmParams.encode(params));
        entity.setContentHash(AdSimilarAlgorithmParams.contentHash(params));
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        revisionMapper.insert(entity);
        AdAlgorithmRevisionVO vo = AdAlgorithmRevisionVO.from(entity);
        vo.setAlgorithmName(algorithm.getAlgoName());
        vo.setBrand(algorithm.getBrand());
        return vo;
    }

    @Override
    public List<AdAlgorithmRevisionVO> list(Long algorithmId) {
        AdAlgorithm algorithm = algorithmMapper.selectById(algorithmId);
        if (algorithm == null) throw new BusinessException("算法不存在");
        return revisionMapper.selectList(new LambdaQueryWrapper<AdAlgorithmRevision>()
                        .eq(AdAlgorithmRevision::getAlgorithmId, algorithmId)
                        .orderByDesc(AdAlgorithmRevision::getRevision))
                .stream().map(entity -> {
                    AdAlgorithmRevisionVO vo = AdAlgorithmRevisionVO.from(entity);
                    vo.setAlgorithmName(algorithm.getAlgoName());
                    vo.setBrand(algorithm.getBrand());
                    return vo;
                }).toList();
    }
}

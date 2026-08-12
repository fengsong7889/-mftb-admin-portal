package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingReviveRequest;
import com.mftb.admin.dto.AdPricingReviveVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdPricingRevive;
import com.mftb.admin.entity.AdPricingReviveRegion;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdPricingReviveMapper;
import com.mftb.admin.mapper.AdPricingReviveRegionMapper;
import com.mftb.admin.service.AdPricingReviveService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 盘活复苏销售定价服务实现
 */
@Service
@RequiredArgsConstructor
public class AdPricingReviveServiceImpl implements AdPricingReviveService {

    /** 预售天数缺省值（盘活复苏默认 180 天） */
    private static final int DEFAULT_PRESALE_DAYS = 180;

    private final AdPricingReviveMapper pricingMapper;
    private final AdPricingReviveRegionMapper regionMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    @Override
    public PageResult<AdPricingReviveVO> page(long page, long size, Long algoId, String brand, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdPricingRevive> wrapper = new LambdaQueryWrapper<>();
        if (algoId != null) wrapper.eq(AdPricingRevive::getAlgoId, algoId);
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingRevive::getBrand, brand);
        if (status != null) wrapper.eq(AdPricingRevive::getStatus, status);
        wrapper.orderByDesc(AdPricingRevive::getId);

        Page<AdPricingRevive> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingReviveVO> records = result.getRecords().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingReviveVO detail(Long id) {
        return toVO(require(id));
    }

    @Override
    public AdPricingReviveVO activeByAlgo(Long algoId) {
        AdPricingRevive pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingRevive>()
                        .eq(AdPricingRevive::getAlgoId, algoId)
                        .eq(AdPricingRevive::getStatus, 1)
                        .orderByDesc(AdPricingRevive::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingReviveVO create(AdPricingReviveRequest request) {
        AdAlgorithm algorithm = requireAlgorithm(request.getAlgoId());

        AdPricingRevive entity = new AdPricingRevive();
        // 定价编号：按编号生成规则 config_pricing_revive（DJPH + YYYYMMDD + 3位）
        entity.setPricingNo(bizSeqService.next(BizSeqService.RULE_PRICING_REVIVE));
        applyRequest(entity, request, algorithm);
        if (entity.getStatus() == null) {
            entity.setStatus(1);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        pricingMapper.insert(entity);

        saveRegionPrices(entity.getId(), request);
        return detail(entity.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingReviveVO update(Long id, AdPricingReviveRequest request) {
        AdPricingRevive entity = require(id);
        AdAlgorithm algorithm = requireAlgorithm(request.getAlgoId());
        applyRequest(entity, request, algorithm);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);

        // 商圈计价整体替换：旧明细逻辑删除后写入新明细
        regionMapper.delete(new LambdaQueryWrapper<AdPricingReviveRegion>()
                .eq(AdPricingReviveRegion::getPricingId, id));
        saveRegionPrices(id, request);
        return detail(id);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdPricingRevive entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
    }

    @Override
    public void delete(Long id) {
        require(id);
        pricingMapper.deleteById(id);
        regionMapper.delete(new LambdaQueryWrapper<AdPricingReviveRegion>()
                .eq(AdPricingReviveRegion::getPricingId, id));
    }

    /* ==================== 内部方法 ==================== */

    private AdPricingRevive require(Long id) {
        AdPricingRevive entity = pricingMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("计价配置不存在");
        }
        return entity;
    }

    private AdAlgorithm requireAlgorithm(Long algoId) {
        AdAlgorithm algorithm = algorithmMapper.selectById(algoId);
        if (algorithm == null) {
            throw new BusinessException("关联算法不存在");
        }
        return algorithm;
    }

    private void applyRequest(AdPricingRevive entity, AdPricingReviveRequest request, AdAlgorithm algorithm) {
        entity.setAlgoId(algorithm.getId());
        entity.setAlgoName(algorithm.getAlgoName());
        entity.setBrand(StringUtils.hasText(request.getBrand()) ? request.getBrand() : algorithm.getBrand());
        entity.setChannel(request.getChannel() != null ? request.getChannel() : algorithm.getChannel());
        entity.setPresaleDays(request.getPresaleDays() == null || request.getPresaleDays() < 1
                ? DEFAULT_PRESALE_DAYS : request.getPresaleDays());
        entity.setRefundEnabled(request.getRefundEnabled() == null ? 1 : request.getRefundEnabled());
        entity.setDiscountTiers(request.getDiscountTiers() == null ? null : JsonUtils.toJson(request.getDiscountTiers()));
        entity.setCancelFeeTiers(request.getCancelFeeTiers() == null ? null : JsonUtils.toJson(request.getCancelFeeTiers()));
        entity.setBlockMerchant(request.getBlockMerchant() == null ? 2 : request.getBlockMerchant());
        entity.setBlockList(request.getBlockList() == null ? null : JsonUtils.toJson(request.getBlockList()));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    private void saveRegionPrices(Long pricingId, AdPricingReviveRequest request) {
        List<AdPricingReviveRequest.RegionPrice> prices = request.getRegionPrices();
        if (prices == null || prices.isEmpty()) {
            return;
        }
        Set<Integer> seen = new HashSet<>();
        for (AdPricingReviveRequest.RegionPrice price : prices) {
            if (price.getRegion() == null) {
                throw new BusinessException("商圈不能为空");
            }
            if (!seen.add(price.getRegion())) {
                throw new BusinessException("商圈配置重复");
            }
            AdPricingReviveRegion region = new AdPricingReviveRegion();
            region.setPricingId(pricingId);
            region.setRegion(price.getRegion());
            region.setDailyPrice(price.getDailyPrice() == null ? BigDecimal.ZERO : price.getDailyPrice());
            region.setDailySalesLimit(price.getDailySalesLimit() == null || price.getDailySalesLimit() < 1
                    ? 1 : price.getDailySalesLimit());
            region.setDeleted(0);
            regionMapper.insert(region);
        }
    }

    private AdPricingReviveVO toVO(AdPricingRevive entity) {
        AdPricingReviveVO vo = AdPricingReviveVO.from(entity);
        List<AdPricingReviveRegion> regions = regionMapper.selectList(
                new LambdaQueryWrapper<AdPricingReviveRegion>()
                        .eq(AdPricingReviveRegion::getPricingId, entity.getId())
                        .orderByAsc(AdPricingReviveRegion::getRegion));
        for (AdPricingReviveRegion region : regions) {
            AdPricingReviveVO.RegionPriceItem item = new AdPricingReviveVO.RegionPriceItem();
            item.setId(region.getId());
            item.setRegion(region.getRegion());
            item.setDailyPrice(region.getDailyPrice());
            item.setDailySalesLimit(region.getDailySalesLimit() == null ? 1 : region.getDailySalesLimit());
            vo.getRegionPrices().add(item);
        }
        return vo;
    }
}

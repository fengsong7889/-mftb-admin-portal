package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingStarRequest;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdPricingStar;
import com.mftb.admin.entity.AdPricingStarRegion;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdPricingStarMapper;
import com.mftb.admin.mapper.AdPricingStarRegionMapper;
import com.mftb.admin.service.AdPricingStarService;
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
 * 无敌星星销售定价服务实现
 */
@Service
@RequiredArgsConstructor
public class AdPricingStarServiceImpl implements AdPricingStarService {

    private final AdPricingStarMapper pricingMapper;
    private final AdPricingStarRegionMapper regionMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AdPricingStarVO> page(long page, long size, Long algoId, String brand, Integer status) {
        LambdaQueryWrapper<AdPricingStar> wrapper = new LambdaQueryWrapper<>();
        if (algoId != null) wrapper.eq(AdPricingStar::getAlgoId, algoId);
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingStar::getBrand, brand);
        if (status != null) wrapper.eq(AdPricingStar::getStatus, status);
        wrapper.orderByDesc(AdPricingStar::getId);

        Page<AdPricingStar> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingStarVO> records = result.getRecords().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingStarVO detail(Long id) {
        return toVO(require(id));
    }

    @Override
    public AdPricingStarVO activeByAlgo(Long algoId) {
        AdPricingStar pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingStar>()
                        .eq(AdPricingStar::getAlgoId, algoId)
                        .eq(AdPricingStar::getStatus, 1)
                        .orderByDesc(AdPricingStar::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingStarVO create(AdPricingStarRequest request) {
        AdAlgorithm algorithm = requireAlgorithm(request.getAlgoId());

        AdPricingStar entity = new AdPricingStar();
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
    public AdPricingStarVO update(Long id, AdPricingStarRequest request) {
        AdPricingStar entity = require(id);
        AdAlgorithm algorithm = requireAlgorithm(request.getAlgoId());
        applyRequest(entity, request, algorithm);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);

        // 商圈日单价整体替换：旧明细逻辑删除后写入新明细
        regionMapper.delete(new LambdaQueryWrapper<AdPricingStarRegion>()
                .eq(AdPricingStarRegion::getPricingId, id));
        saveRegionPrices(id, request);
        return detail(id);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdPricingStar entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
    }

    @Override
    public void delete(Long id) {
        require(id);
        pricingMapper.deleteById(id);
        regionMapper.delete(new LambdaQueryWrapper<AdPricingStarRegion>()
                .eq(AdPricingStarRegion::getPricingId, id));
    }

    /* ==================== 内部方法 ==================== */

    private AdPricingStar require(Long id) {
        AdPricingStar entity = pricingMapper.selectById(id);
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

    private void applyRequest(AdPricingStar entity, AdPricingStarRequest request, AdAlgorithm algorithm) {
        entity.setAlgoId(algorithm.getId());
        entity.setAlgoName(algorithm.getAlgoName());
        entity.setBrand(StringUtils.hasText(request.getBrand()) ? request.getBrand() : algorithm.getBrand());
        entity.setChannel(request.getChannel() != null ? request.getChannel() : algorithm.getChannel());
        entity.setPresaleDays(request.getPresaleDays());
        entity.setRefundEnabled(request.getRefundEnabled() == null ? 1 : request.getRefundEnabled());
        entity.setDiscountTiers(request.getDiscountTiers() == null ? null : JsonUtils.toJson(request.getDiscountTiers()));
        entity.setCancelFeeTiers(request.getCancelFeeTiers() == null ? null : JsonUtils.toJson(request.getCancelFeeTiers()));
        entity.setBlockMerchant(request.getBlockMerchant() == null ? 2 : request.getBlockMerchant());
        entity.setBlockList(request.getBlockList() == null ? null : JsonUtils.toJson(request.getBlockList()));
        entity.setSellTimeSlots(request.getSellTimeSlots() == null ? null : JsonUtils.toJson(request.getSellTimeSlots()));
        entity.setSlotDiscounts(request.getSlotDiscounts() == null ? null : JsonUtils.toJson(request.getSlotDiscounts()));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    private void saveRegionPrices(Long pricingId, AdPricingStarRequest request) {
        List<AdPricingStarRequest.RegionPrice> prices = request.getRegionPrices();
        if (prices == null || prices.isEmpty()) {
            return;
        }
        Set<Integer> seen = new HashSet<>();
        for (AdPricingStarRequest.RegionPrice price : prices) {
            if (price.getRegion() == null) {
                throw new BusinessException("商圈不能为空");
            }
            if (!seen.add(price.getRegion())) {
                throw new BusinessException("商圈配置重复");
            }
            AdPricingStarRegion region = new AdPricingStarRegion();
            region.setPricingId(pricingId);
            region.setRegion(price.getRegion());
            region.setDailyPrice(price.getDailyPrice() == null ? BigDecimal.ZERO : price.getDailyPrice());
            region.setDailySalesLimit(price.getDailySalesLimit() == null || price.getDailySalesLimit() < 1
                    ? 1 : price.getDailySalesLimit());
            region.setDeleted(0);
            regionMapper.insert(region);
        }
    }

    private AdPricingStarVO toVO(AdPricingStar entity) {
        AdPricingStarVO vo = AdPricingStarVO.from(entity);
        List<AdPricingStarRegion> regions = regionMapper.selectList(
                new LambdaQueryWrapper<AdPricingStarRegion>()
                        .eq(AdPricingStarRegion::getPricingId, entity.getId())
                        .orderByAsc(AdPricingStarRegion::getRegion));
        for (AdPricingStarRegion region : regions) {
            AdPricingStarVO.RegionPriceItem item = new AdPricingStarVO.RegionPriceItem();
            item.setId(region.getId());
            item.setRegion(region.getRegion());
            item.setDailyPrice(region.getDailyPrice());
            item.setDailySalesLimit(region.getDailySalesLimit() == null ? 1 : region.getDailySalesLimit());
            vo.getRegionPrices().add(item);
        }
        return vo;
    }
}

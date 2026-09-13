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
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 盘活复苏销售定价服务实现
 */
@Service
public class AdPricingReviveServiceImpl extends
        AbstractAdPricingService<AdPricingRevive, AdPricingReviveVO, AdPricingReviveRequest, AdPricingReviveMapper>
        implements AdPricingReviveService {

    /** 预售天数缺省值（盘活复苏默认 180 天） */
    private static final int DEFAULT_PRESALE_DAYS = 180;

    private final AdPricingReviveRegionMapper regionMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final BizSeqService bizSeqService;

    public AdPricingReviveServiceImpl(AdPricingReviveMapper pricingMapper, OperatorResolver operatorResolver,
                                      AdPricingReviveRegionMapper regionMapper, AdAlgorithmMapper algorithmMapper,
                                      BizSeqService bizSeqService) {
        super(pricingMapper, operatorResolver);
        this.regionMapper = regionMapper;
        this.algorithmMapper = algorithmMapper;
        this.bizSeqService = bizSeqService;
    }

    /* ==================== 接口方法 — 签名各异不能提至基类 ==================== */

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
    public AdPricingReviveVO activeByAlgo(Long algoId) {
        AdPricingRevive pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingRevive>()
                        .eq(AdPricingRevive::getAlgoId, algoId)
                        .eq(AdPricingRevive::getStatus, 1)
                        .orderByDesc(AdPricingRevive::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    /* ==================== 创建/更新前校验钩子 ==================== */

    @Override
    protected void preCreate(AdPricingReviveRequest request) {
        requireAlgorithm(request.getAlgoId());
    }

    @Override
    protected void preUpdate(Long id, AdPricingReviveRequest request) {
        requireAlgorithm(request.getAlgoId());
    }

    /* ==================== 抽象方法实现 ==================== */

    @Override
    protected AdPricingReviveVO toVO(AdPricingRevive entity) {
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

    @Override
    protected String nextPricingNo() {
        return bizSeqService.next(BizSeqService.RULE_PRICING_REVIVE);
    }

    @Override
    protected void applyRequest(AdPricingRevive entity, AdPricingReviveRequest request) {
        AdAlgorithm algorithm = requireAlgorithm(request.getAlgoId());
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

    @Override
    protected void saveChildren(Long pricingId, AdPricingReviveRequest request) {
        saveRegionPrices(pricingId, request);
    }

    @Override
    protected void deleteChildren(Long pricingId) {
        regionMapper.delete(new LambdaQueryWrapper<AdPricingReviveRegion>()
                .eq(AdPricingReviveRegion::getPricingId, pricingId));
    }

    /* ==================== 实体 Hook（一行实现） ==================== */

    @Override protected AdPricingRevive newEntity() { return new AdPricingRevive(); }
    @Override protected void setPricingNo(AdPricingRevive e, String no) { e.setPricingNo(no); }
    @Override protected Integer getStatus(AdPricingRevive e) { return e.getStatus(); }
    @Override protected void setStatus(AdPricingRevive e, Integer s) { e.setStatus(s); }
    @Override protected void setUpdatedBy(AdPricingRevive e, String u) { e.setUpdatedBy(u); }
    @Override protected void setDeleted(AdPricingRevive e, int d) { e.setDeleted(d); }
    @Override protected Long getId(AdPricingRevive e) { return e.getId(); }

    /* ==================== 内部方法 ==================== */

    private AdAlgorithm requireAlgorithm(Long algoId) {
        AdAlgorithm algorithm = algorithmMapper.selectById(algoId);
        if (algorithm == null) {
            throw new BusinessException("关联算法不存在");
        }
        return algorithm;
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
}

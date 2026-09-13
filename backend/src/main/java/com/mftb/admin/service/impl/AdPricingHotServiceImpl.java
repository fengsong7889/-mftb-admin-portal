package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingHotRequest;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdPricingHot;
import com.mftb.admin.entity.AdPricingHotSkin;
import com.mftb.admin.mapper.AdPricingHotMapper;
import com.mftb.admin.mapper.AdPricingHotSkinMapper;
import com.mftb.admin.service.AdPricingHotService;
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
 * 人气商家销售定价服务实现
 */
@Service
public class AdPricingHotServiceImpl extends
        AbstractAdPricingService<AdPricingHot, AdPricingHotVO, AdPricingHotRequest, AdPricingHotMapper>
        implements AdPricingHotService {

    /** 预售天数缺省值（人气商家默认 30 天） */
    private static final int DEFAULT_PRESALE_DAYS = 30;

    private final AdPricingHotSkinMapper skinMapper;
    private final BizSeqService bizSeqService;

    public AdPricingHotServiceImpl(AdPricingHotMapper pricingMapper, OperatorResolver operatorResolver,
                                   AdPricingHotSkinMapper skinMapper, BizSeqService bizSeqService) {
        super(pricingMapper, operatorResolver);
        this.skinMapper = skinMapper;
        this.bizSeqService = bizSeqService;
    }

    /* ==================== 接口方法 — 签名各异不能提至基类 ==================== */

    @Override
    public PageResult<AdPricingHotVO> page(long page, long size, Long algoId, String brand, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdPricingHot> wrapper = new LambdaQueryWrapper<>();
        if (algoId != null) wrapper.eq(AdPricingHot::getAlgoId, algoId);
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingHot::getBrand, brand);
        if (status != null) wrapper.eq(AdPricingHot::getStatus, status);
        wrapper.orderByDesc(AdPricingHot::getId);

        Page<AdPricingHot> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingHotVO> records = result.getRecords().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingHotVO activeByAlgo(Long algoId) {
        AdPricingHot pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingHot>()
                        .eq(AdPricingHot::getAlgoId, algoId)
                        .eq(AdPricingHot::getStatus, 1)
                        .orderByDesc(AdPricingHot::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    /* ==================== 抽象方法实现 ==================== */

    @Override
    protected AdPricingHotVO toVO(AdPricingHot entity) {
        AdPricingHotVO vo = AdPricingHotVO.from(entity);
        List<AdPricingHotSkin> skins = skinMapper.selectList(
                new LambdaQueryWrapper<AdPricingHotSkin>()
                        .eq(AdPricingHotSkin::getPricingId, entity.getId())
                        .orderByAsc(AdPricingHotSkin::getId));
        for (AdPricingHotSkin skin : skins) {
            AdPricingHotVO.SkinPriceItem item = new AdPricingHotVO.SkinPriceItem();
            item.setId(skin.getId());
            item.setSkinName(skin.getSkinName());
            item.setPrice(skin.getPrice());
            item.setBorderType(skin.getBorderType());
            item.setBorderColor(skin.getBorderColor());
            item.setDishLayout(skin.getDishLayout());
            item.setTier(skin.getTier());
            vo.getSkins().add(item);
        }
        return vo;
    }

    @Override
    protected String nextPricingNo() {
        return bizSeqService.next(BizSeqService.RULE_PRICING_HOT);
    }

    @Override
    protected void applyRequest(AdPricingHot entity, AdPricingHotRequest request) {
        // 解耦算法库：人气名称、品牌、频道均从请求直接获取
        if (request.getAlgoId() != null) {
            entity.setAlgoId(request.getAlgoId());
        }
        entity.setAlgoName(StringUtils.hasText(request.getAlgoName()) ? request.getAlgoName() : entity.getAlgoName());
        entity.setBrand(request.getBrand());
        entity.setChannel(request.getChannel());
        entity.setPresaleDays(request.getPresaleDays() == null || request.getPresaleDays() < 1
                ? DEFAULT_PRESALE_DAYS : request.getPresaleDays());
        entity.setGiftCashValue(request.getGiftCashValue());
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
    protected void saveChildren(Long pricingId, AdPricingHotRequest request) {
        saveSkinPrices(pricingId, request);
    }

    @Override
    protected void deleteChildren(Long pricingId) {
        skinMapper.delete(new LambdaQueryWrapper<AdPricingHotSkin>()
                .eq(AdPricingHotSkin::getPricingId, pricingId));
    }

    /* ==================== 实体 Hook（一行实现） ==================== */

    @Override protected AdPricingHot newEntity() { return new AdPricingHot(); }
    @Override protected void setPricingNo(AdPricingHot e, String no) { e.setPricingNo(no); }
    @Override protected Integer getStatus(AdPricingHot e) { return e.getStatus(); }
    @Override protected void setStatus(AdPricingHot e, Integer s) { e.setStatus(s); }
    @Override protected void setUpdatedBy(AdPricingHot e, String u) { e.setUpdatedBy(u); }
    @Override protected void setDeleted(AdPricingHot e, int d) { e.setDeleted(d); }
    @Override protected Long getId(AdPricingHot e) { return e.getId(); }

    /* ==================== 内部方法 ==================== */

    private void saveSkinPrices(Long pricingId, AdPricingHotRequest request) {
        List<AdPricingHotRequest.SkinPrice> skins = request.getSkins();
        if (skins == null || skins.isEmpty()) {
            return;
        }
        Set<String> seen = new HashSet<>();
        for (AdPricingHotRequest.SkinPrice skin : skins) {
            if (!StringUtils.hasText(skin.getSkinName())) {
                throw new BusinessException("皮肤名称不能为空");
            }
            if (!seen.add(skin.getSkinName())) {
                throw new BusinessException("皮肤配置重复: " + skin.getSkinName());
            }
            AdPricingHotSkin entity = new AdPricingHotSkin();
            entity.setPricingId(pricingId);
            entity.setSkinName(skin.getSkinName());
            entity.setPrice(skin.getPrice() == null ? BigDecimal.ZERO : skin.getPrice());
            entity.setBorderType(StringUtils.hasText(skin.getBorderType()) ? skin.getBorderType() : "color");
            entity.setBorderColor(skin.getBorderColor());
            entity.setDishLayout(StringUtils.hasText(skin.getDishLayout()) ? skin.getDishLayout() : "grid");
            entity.setTier(StringUtils.hasText(skin.getTier()) ? skin.getTier() : "classic");
            entity.setDeleted(0);
            skinMapper.insert(entity);
        }
    }
}

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
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 人气商家销售定价服务实现
 */
@Service
@RequiredArgsConstructor
public class AdPricingHotServiceImpl implements AdPricingHotService {

    /** 预售天数缺省值（人气商家默认 30 天） */
    private static final int DEFAULT_PRESALE_DAYS = 30;

    private final AdPricingHotMapper pricingMapper;
    private final AdPricingHotSkinMapper skinMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

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
    public AdPricingHotVO detail(Long id) {
        return toVO(require(id));
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

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingHotVO create(AdPricingHotRequest request) {
        AdPricingHot entity = new AdPricingHot();
        // 定价编号：按编号生成规则 config_pricing_hot（DJRQ + YYYYMMDD + 3位）
        entity.setPricingNo(bizSeqService.next(BizSeqService.RULE_PRICING_HOT));
        applyRequest(entity, request);
        if (entity.getStatus() == null) {
            entity.setStatus(1);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        pricingMapper.insert(entity);

        saveSkinPrices(entity.getId(), request);
        return detail(entity.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingHotVO update(Long id, AdPricingHotRequest request) {
        AdPricingHot entity = require(id);
        applyRequest(entity, request);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);

        // 皮肤计价整体替换：旧明细逻辑删除后写入新明细
        skinMapper.delete(new LambdaQueryWrapper<AdPricingHotSkin>()
                .eq(AdPricingHotSkin::getPricingId, id));
        saveSkinPrices(id, request);
        return detail(id);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdPricingHot entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
    }

    @Override
    public void delete(Long id) {
        require(id);
        pricingMapper.deleteById(id);
        skinMapper.delete(new LambdaQueryWrapper<AdPricingHotSkin>()
                .eq(AdPricingHotSkin::getPricingId, id));
    }

    /* ==================== 内部方法 ==================== */

    private AdPricingHot require(Long id) {
        AdPricingHot entity = pricingMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("计价配置不存在");
        }
        return entity;
    }

    private void applyRequest(AdPricingHot entity, AdPricingHotRequest request) {
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

    private AdPricingHotVO toVO(AdPricingHot entity) {
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
}

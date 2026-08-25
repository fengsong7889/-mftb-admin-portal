package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingSignboardRequest;
import com.mftb.admin.dto.AdPricingSignboardVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdPricingSignboard;
import com.mftb.admin.entity.AdPricingSignboardLabel;
import com.mftb.admin.mapper.AdPricingSignboardLabelMapper;
import com.mftb.admin.mapper.AdPricingSignboardMapper;
import com.mftb.admin.service.AdPricingSignboardService;
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
 * 金字招牌计价服务实现
 */
@Service
@RequiredArgsConstructor
public class AdPricingSignboardServiceImpl implements AdPricingSignboardService {

    /** 预售天数缺省值（金字招牌默认 7 天） */
    private static final int DEFAULT_PRESALE_DAYS = 7;

    /** 编号生成规则 key */
    public static final String RULE_PRICING_SIGNBOARD = "config_pricing_signboard";

    private final AdPricingSignboardMapper pricingMapper;
    private final AdPricingSignboardLabelMapper labelMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    @Override
    public PageResult<AdPricingSignboardVO> page(long page, long size, Long algoId, String brand, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdPricingSignboard> wrapper = new LambdaQueryWrapper<>();
        if (algoId != null) wrapper.eq(AdPricingSignboard::getAlgoId, algoId);
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingSignboard::getBrand, brand);
        if (status != null) wrapper.eq(AdPricingSignboard::getStatus, status);
        wrapper.orderByDesc(AdPricingSignboard::getId);

        Page<AdPricingSignboard> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingSignboardVO> records = result.getRecords().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingSignboardVO detail(Long id) {
        return toVO(require(id));
    }

    @Override
    public AdPricingSignboardVO activeByAlgo(Long algoId) {
        AdPricingSignboard pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingSignboard>()
                        .eq(AdPricingSignboard::getAlgoId, algoId)
                        .eq(AdPricingSignboard::getStatus, 1)
                        .orderByDesc(AdPricingSignboard::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingSignboardVO create(AdPricingSignboardRequest request) {
        AdPricingSignboard entity = new AdPricingSignboard();
        entity.setPricingNo(bizSeqService.next(RULE_PRICING_SIGNBOARD));
        applyRequest(entity, request);
        if (entity.getStatus() == null) {
            entity.setStatus(1);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        pricingMapper.insert(entity);

        saveLabelPrices(entity.getId(), request);
        return detail(entity.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingSignboardVO update(Long id, AdPricingSignboardRequest request) {
        AdPricingSignboard entity = require(id);
        applyRequest(entity, request);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);

        // 标签计价整体替换
        labelMapper.delete(new LambdaQueryWrapper<AdPricingSignboardLabel>()
                .eq(AdPricingSignboardLabel::getPricingId, id));
        saveLabelPrices(id, request);
        return detail(id);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdPricingSignboard entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
    }

    @Override
    public void delete(Long id) {
        require(id);
        pricingMapper.deleteById(id);
        labelMapper.delete(new LambdaQueryWrapper<AdPricingSignboardLabel>()
                .eq(AdPricingSignboardLabel::getPricingId, id));
    }

    /* ==================== 内部方法 ==================== */

    private AdPricingSignboard require(Long id) {
        AdPricingSignboard entity = pricingMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("计价配置不存在");
        }
        return entity;
    }

    private void applyRequest(AdPricingSignboard entity, AdPricingSignboardRequest request) {
        entity.setAlgoId(request.getAlgoId());
        entity.setAlgoName(StringUtils.hasText(request.getAlgoName()) ? request.getAlgoName() : entity.getAlgoName());
        entity.setBrand(request.getBrand());
        entity.setChannel(request.getChannel());
        entity.setPresaleDays(request.getPresaleDays() == null || request.getPresaleDays() < 1
                ? DEFAULT_PRESALE_DAYS : request.getPresaleDays());
        entity.setRefundEnabled(request.getRefundEnabled() == null ? 1 : request.getRefundEnabled());
        entity.setCancelFeeTiers(request.getCancelFeeTiers() == null ? null : JsonUtils.toJson(request.getCancelFeeTiers()));
        entity.setDiscountMode(request.getDiscountMode() != null ? request.getDiscountMode() : "local");
        entity.setGlobalDiscountTiers(request.getGlobalDiscountTiers() == null ? null : JsonUtils.toJson(request.getGlobalDiscountTiers()));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    private void saveLabelPrices(Long pricingId, AdPricingSignboardRequest request) {
        List<AdPricingSignboardRequest.LabelPrice> items = request.getSignboardItems();
        if (items == null || items.isEmpty()) {
            return;
        }
        Set<String> seen = new HashSet<>();
        for (AdPricingSignboardRequest.LabelPrice item : items) {
            if (!StringUtils.hasText(item.getLabelType())) {
                throw new BusinessException("标签类型不能为空");
            }
            // 按 labelType + scenario 联合唯一校验
            String scenarioKey = item.getScenario() != null ? item.getScenario() : "";
            String compositeKey = item.getLabelType() + ":" + scenarioKey;
            if (!seen.add(compositeKey)) {
                throw new BusinessException("标签配置重复: " + item.getLabelType()
                        + (StringUtils.hasText(item.getScenario()) ? "[" + item.getScenario() + "]" : ""));
            }
            AdPricingSignboardLabel entity = new AdPricingSignboardLabel();
            entity.setPricingId(pricingId);
            entity.setLabelType(item.getLabelType());
            entity.setScenario(item.getScenario());
            entity.setEnabled(Boolean.TRUE.equals(item.getEnabled()) ? 1 : 0);
            entity.setPrice(item.getPrice() == null ? BigDecimal.ZERO : item.getPrice());
            entity.setDiscountTiers(item.getDiscountTiers() == null ? null : JsonUtils.toJson(item.getDiscountTiers()));
            entity.setDeleted(0);
            labelMapper.insert(entity);
        }
    }

    private AdPricingSignboardVO toVO(AdPricingSignboard entity) {
        AdPricingSignboardVO vo = AdPricingSignboardVO.from(entity);
        List<AdPricingSignboardLabel> labels = labelMapper.selectList(
                new LambdaQueryWrapper<AdPricingSignboardLabel>()
                        .eq(AdPricingSignboardLabel::getPricingId, entity.getId())
                        .orderByAsc(AdPricingSignboardLabel::getId));
        for (AdPricingSignboardLabel label : labels) {
            AdPricingSignboardVO.LabelPriceItem item = new AdPricingSignboardVO.LabelPriceItem();
            item.setId(label.getId());
            item.setLabelType(label.getLabelType());
            item.setScenario(label.getScenario());
            item.setEnabled(label.getEnabled() != null && label.getEnabled() == 1);
            item.setPrice(label.getPrice());
            item.setDiscountTiers(label.getDiscountTiers());
            vo.getSignboardItems().add(item);
        }
        return vo;
    }
}

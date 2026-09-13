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
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 金字招牌计价服务实现
 */
@Service
public class AdPricingSignboardServiceImpl extends
        AbstractAdPricingService<AdPricingSignboard, AdPricingSignboardVO, AdPricingSignboardRequest, AdPricingSignboardMapper>
        implements AdPricingSignboardService {

    /** 预售天数缺省值（金字招牌默认 7 天） */
    private static final int DEFAULT_PRESALE_DAYS = 7;

    /** 编号生成规则 key */
    public static final String RULE_PRICING_SIGNBOARD = "config_pricing_signboard";

    private final AdPricingSignboardLabelMapper labelMapper;
    private final BizSeqService bizSeqService;

    public AdPricingSignboardServiceImpl(AdPricingSignboardMapper pricingMapper, OperatorResolver operatorResolver,
                                         AdPricingSignboardLabelMapper labelMapper, BizSeqService bizSeqService) {
        super(pricingMapper, operatorResolver);
        this.labelMapper = labelMapper;
        this.bizSeqService = bizSeqService;
    }

    /* ==================== 接口方法 — 签名各异不能提至基类 ==================== */

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
    public AdPricingSignboardVO activeByAlgo(Long algoId) {
        AdPricingSignboard pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingSignboard>()
                        .eq(AdPricingSignboard::getAlgoId, algoId)
                        .eq(AdPricingSignboard::getStatus, 1)
                        .orderByDesc(AdPricingSignboard::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    /* ==================== 抽象方法实现 ==================== */

    @Override
    protected AdPricingSignboardVO toVO(AdPricingSignboard entity) {
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

    @Override
    protected String nextPricingNo() {
        return bizSeqService.next(RULE_PRICING_SIGNBOARD);
    }

    @Override
    protected void applyRequest(AdPricingSignboard entity, AdPricingSignboardRequest request) {
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

    @Override
    protected void saveChildren(Long pricingId, AdPricingSignboardRequest request) {
        saveLabelPrices(pricingId, request);
    }

    @Override
    protected void deleteChildren(Long pricingId) {
        labelMapper.delete(new LambdaQueryWrapper<AdPricingSignboardLabel>()
                .eq(AdPricingSignboardLabel::getPricingId, pricingId));
    }

    /* ==================== 实体 Hook（一行实现） ==================== */

    @Override protected AdPricingSignboard newEntity() { return new AdPricingSignboard(); }
    @Override protected void setPricingNo(AdPricingSignboard e, String no) { e.setPricingNo(no); }
    @Override protected Integer getStatus(AdPricingSignboard e) { return e.getStatus(); }
    @Override protected void setStatus(AdPricingSignboard e, Integer s) { e.setStatus(s); }
    @Override protected void setUpdatedBy(AdPricingSignboard e, String u) { e.setUpdatedBy(u); }
    @Override protected void setDeleted(AdPricingSignboard e, int d) { e.setDeleted(d); }
    @Override protected Long getId(AdPricingSignboard e) { return e.getId(); }

    /* ==================== 内部方法 ==================== */

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
}

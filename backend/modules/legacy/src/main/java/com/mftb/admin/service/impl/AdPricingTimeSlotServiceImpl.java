/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingTimeSlotRequest;
import com.mftb.admin.dto.AdPricingTimeSlotVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdPricingTimeSlot;
import com.mftb.admin.entity.AdPricingTimeSlotSlot;
import com.mftb.admin.mapper.AdPricingTimeSlotMapper;
import com.mftb.admin.mapper.AdPricingTimeSlotSlotMapper;
import com.mftb.admin.service.AdPricingTimeSlotService;
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
 * 時段推薦廣告計價服務實現
 */
@Service
public class AdPricingTimeSlotServiceImpl extends
        AbstractAdPricingService<AdPricingTimeSlot, AdPricingTimeSlotVO, AdPricingTimeSlotRequest, AdPricingTimeSlotMapper>
        implements AdPricingTimeSlotService {

    /** 預售天數缺省值 */
    private static final int DEFAULT_PRESALE_DAYS = 7;

    /** 編號生成規則 key */
    public static final String RULE_PRICING_TIMESLOT = "config_pricing_timeslot";

    private final AdPricingTimeSlotSlotMapper slotMapper;
    private final BizSeqService bizSeqService;

    public AdPricingTimeSlotServiceImpl(AdPricingTimeSlotMapper pricingMapper, OperatorResolver operatorResolver,
                                        AdPricingTimeSlotSlotMapper slotMapper, BizSeqService bizSeqService) {
        super(pricingMapper, operatorResolver);
        this.slotMapper = slotMapper;
        this.bizSeqService = bizSeqService;
    }

    @Override
    public PageResult<AdPricingTimeSlotVO> page(long page, long size, String brand, Integer channel, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdPricingTimeSlot> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingTimeSlot::getBrand, brand);
        if (channel != null) wrapper.eq(AdPricingTimeSlot::getChannel, channel);
        if (status != null) wrapper.eq(AdPricingTimeSlot::getStatus, status);
        wrapper.orderByDesc(AdPricingTimeSlot::getId);

        Page<AdPricingTimeSlot> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingTimeSlotVO> records = result.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingTimeSlotVO detailOrNull(Long id) {
        if (id == null) {
            return null;
        }
        AdPricingTimeSlot entity = pricingMapper.selectById(id);
        return entity == null ? null : toVO(entity);
    }

    /* ==================== 創建/更新前校驗 ==================== */

    @Override
    protected void preCreate(AdPricingTimeSlotRequest request) {
        validateSlots(request);
    }

    @Override
    protected void preUpdate(Long id, AdPricingTimeSlotRequest request) {
        validateSlots(request);
    }

    /**
     * 時段明細服務端校驗（安全邊界，不信任前端）：
     * slotKey 唯一；每段售價 &gt; 0；啟用折扣時折扣必填且落於 (0,10]。
     */
    private void validateSlots(AdPricingTimeSlotRequest request) {
        List<AdPricingTimeSlotRequest.SlotItem> items = request.getSlots();
        if (items == null || items.isEmpty()) {
            throw new BusinessException("請至少配置一個售卖時段");
        }
        Set<String> seen = new HashSet<>();
        for (AdPricingTimeSlotRequest.SlotItem item : items) {
            if (!StringUtils.hasText(item.getSlotName())) {
                throw new BusinessException("時段名稱不能為空");
            }
            String key = StringUtils.hasText(item.getSlotKey()) ? item.getSlotKey() : item.getSlotName();
            if (!seen.add(key)) {
                throw new BusinessException("時段配置重複: " + item.getSlotName());
            }
            if (item.getPrice() == null || item.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("「" + item.getSlotName() + "」售賣價格必須大於 0");
            }
            if (Boolean.TRUE.equals(item.getDiscountEnabled())) {
                BigDecimal d = item.getDiscount();
                if (d == null || d.compareTo(BigDecimal.ZERO) <= 0 || d.compareTo(BigDecimal.TEN) > 0) {
                    throw new BusinessException("「" + item.getSlotName() + "」折扣須在 0~10 折之間");
                }
                // 限時折扣必須選定折扣周期（與前端 isSlotLimited 同口徑）
                if ("limited".equals(item.getDiscountTimeMode())
                        && (!StringUtils.hasText(item.getDiscountStartDate()) || !StringUtils.hasText(item.getDiscountEndDate()))) {
                    throw new BusinessException("「" + item.getSlotName() + "」已開啟限時折扣，請選擇折扣周期");
                }
            }
        }
    }

    /* ==================== 抽象方法實現 ==================== */

    @Override
    protected AdPricingTimeSlotVO toVO(AdPricingTimeSlot entity) {
        AdPricingTimeSlotVO vo = AdPricingTimeSlotVO.from(entity);
        List<AdPricingTimeSlotSlot> slots = slotMapper.selectList(
                new LambdaQueryWrapper<AdPricingTimeSlotSlot>()
                        .eq(AdPricingTimeSlotSlot::getPricingId, entity.getId())
                        .orderByAsc(AdPricingTimeSlotSlot::getSortOrder)
                        .orderByAsc(AdPricingTimeSlotSlot::getId));
        for (AdPricingTimeSlotSlot slot : slots) {
            AdPricingTimeSlotVO.SlotItem item = new AdPricingTimeSlotVO.SlotItem();
            item.setId(slot.getId());
            item.setSlotKey(slot.getSlotKey());
            item.setSlotName(slot.getSlotName());
            item.setStartTime(slot.getStartTime());
            item.setEndTime(slot.getEndTime());
            item.setPrice(slot.getPrice());
            item.setDiscountEnabled(slot.getDiscountEnabled() != null && slot.getDiscountEnabled() == 1);
            item.setDiscount(slot.getDiscount());
            item.setDiscountTimeMode(slot.getDiscountTimeMode());
            item.setDiscountStartDate(slot.getDiscountStartDate());
            item.setDiscountEndDate(slot.getDiscountEndDate());
            vo.getSlots().add(item);
        }
        return vo;
    }

    @Override
    protected String nextPricingNo() {
        return bizSeqService.next(RULE_PRICING_TIMESLOT);
    }

    @Override
    protected void applyRequest(AdPricingTimeSlot entity, AdPricingTimeSlotRequest request) {
        entity.setAlgoId(request.getAlgoId());
        entity.setAlgoName(request.getAlgoName());
        entity.setBrand(request.getBrand());
        entity.setChannel(request.getChannel());
        entity.setPresaleDays(request.getPresaleDays() == null || request.getPresaleDays() < 1
                ? DEFAULT_PRESALE_DAYS : request.getPresaleDays());
        entity.setMerchantScope(StringUtils.hasText(request.getMerchantScope()) ? request.getMerchantScope() : "all");
        entity.setAllowCategories(toJsonOrNull(request.getAllowCategories()));
        entity.setWhitelistMerchants(toJsonOrNull(request.getWhitelistMerchants()));
        entity.setBlacklistMerchants(toJsonOrNull(request.getBlacklistMerchants()));
        entity.setCategoryExcludeMerchants(toJsonOrNull(request.getCategoryExcludeMerchants()));
        entity.setDaysDiscountEnabled(Boolean.TRUE.equals(request.getDaysDiscountEnabled()) ? 1 : 0);
        entity.setDaysDiscountTiers(toJsonOrNull(request.getDaysDiscountTiers()));
        entity.setRefundEnabled(request.getRefundEnabled() == null ? 1 : request.getRefundEnabled());
        entity.setCancelFeeTiers(toJsonOrNull(request.getCancelFeeTiers()));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    @Override
    protected void saveChildren(Long pricingId, AdPricingTimeSlotRequest request) {
        List<AdPricingTimeSlotRequest.SlotItem> items = request.getSlots();
        if (items == null || items.isEmpty()) {
            return;
        }
        int order = 0;
        for (AdPricingTimeSlotRequest.SlotItem item : items) {
            AdPricingTimeSlotSlot slot = new AdPricingTimeSlotSlot();
            slot.setPricingId(pricingId);
            slot.setSlotKey(StringUtils.hasText(item.getSlotKey()) ? item.getSlotKey() : item.getSlotName());
            slot.setSlotName(item.getSlotName());
            slot.setStartTime(item.getStartTime());
            slot.setEndTime(item.getEndTime());
            slot.setPrice(item.getPrice() == null ? BigDecimal.ZERO : item.getPrice());
            slot.setDiscountEnabled(Boolean.TRUE.equals(item.getDiscountEnabled()) ? 1 : 0);
            slot.setDiscount(item.getDiscount());
            slot.setDiscountTimeMode(StringUtils.hasText(item.getDiscountTimeMode()) ? item.getDiscountTimeMode() : "unlimited");
            slot.setDiscountStartDate(item.getDiscountStartDate());
            slot.setDiscountEndDate(item.getDiscountEndDate());
            slot.setSortOrder(order++);
            slot.setDeleted(0);
            slotMapper.insert(slot);
        }
    }

    @Override
    protected void deleteChildren(Long pricingId) {
        slotMapper.delete(new LambdaQueryWrapper<AdPricingTimeSlotSlot>()
                .eq(AdPricingTimeSlotSlot::getPricingId, pricingId));
    }

    /* ==================== 實體 Hook ==================== */

    @Override protected AdPricingTimeSlot newEntity() { return new AdPricingTimeSlot(); }
    @Override protected void setPricingNo(AdPricingTimeSlot e, String no) { e.setPricingNo(no); }
    @Override protected Integer getStatus(AdPricingTimeSlot e) { return e.getStatus(); }
    @Override protected void setStatus(AdPricingTimeSlot e, Integer s) { e.setStatus(s); }
    @Override protected void setUpdatedBy(AdPricingTimeSlot e, String u) { e.setUpdatedBy(u); }
    @Override protected void setDeleted(AdPricingTimeSlot e, int d) { e.setDeleted(d); }
    @Override protected Long getId(AdPricingTimeSlot e) { return e.getId(); }

    /* ==================== 內部方法 ==================== */

    private static String toJsonOrNull(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof List<?> list && list.isEmpty()) {
            return null;
        }
        return JsonUtils.toJson(value);
    }
}

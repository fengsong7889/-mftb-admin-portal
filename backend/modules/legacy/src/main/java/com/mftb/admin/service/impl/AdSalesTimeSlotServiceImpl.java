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
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingTimeSlotVO;
import com.mftb.admin.dto.AdTimeSlotOrderRequest;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemTimeSlot;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.AdOrderItemTimeSlotMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.service.AdOrderSupport;
import com.mftb.admin.service.AdPricingTimeSlotService;
import com.mftb.admin.service.AdSalesTimeSlotService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 時段推薦廣告銷售服務實現（下單扣款）
 * <p>
 * 售賣單位: 時段 x 日期。商家以購物車多條目 {時段, 日期集合} 下單，後端展開為逐格計價；
 * 先套每時段折扣、再套「按購買天數」折扣檔位（檔位按日期去重後的天數合計匹配），實付從推廣金賬戶扣款。
 * 同一商家同一時段同一日期不可重複購買（含請求內重複）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdSalesTimeSlotServiceImpl implements AdSalesTimeSlotService {

    /** 時段推薦廣告算法類型（與前端 AlgorithmType.TIME_SLOT_AD 一致） */
    private static final int ALGO_TYPE = 16;

    /** 贈送管理中的廣告類型標識 */
    private static final String GIFT_AD_TYPE = "time_slot";

    private final AdOrderMapper orderMapper;
    private final AdOrderItemTimeSlotMapper itemMapper;
    private final AdPricingTimeSlotService pricingService;
    private final AdOrderSupport orderSupport;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdTimeSlotOrderRequest request) {
        AdPricingTimeSlotVO pricing = requireActivePricing(request.getPricingId());
        List<AdPricingTimeSlotVO.SlotItem> slots = pricing.getSlots();
        if (slots == null || slots.isEmpty()) {
            throw new BusinessException("該定價未配置售卖時段");
        }
        String brand = pricing.getBrand();
        Integer channel = request.getChannel() != null ? request.getChannel() : pricing.getChannel();

        // 1. 購物車多條目展開：slotKey -> 日期集合（同 slotKey 多條合併；僅定價已配置的時段可購買）
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new BusinessException("請至少選擇一個時段");
        }
        Map<String, AdPricingTimeSlotVO.SlotItem> slotMap = new java.util.LinkedHashMap<>();
        for (AdPricingTimeSlotVO.SlotItem s : slots) {
            slotMap.put(s.getSlotKey(), s);
        }
        Map<String, java.util.TreeSet<LocalDate>> slotDates = new java.util.LinkedHashMap<>();
        for (AdTimeSlotOrderRequest.OrderItem item : request.getItems()) {
            if (item == null || !StringUtils.hasText(item.getSlotKey()) || item.getDates() == null || item.getDates().isEmpty()) {
                throw new BusinessException("購物車條目不完整（時段與日期均必填）");
            }
            AdPricingTimeSlotVO.SlotItem slot = slotMap.get(item.getSlotKey());
            if (slot == null) {
                throw new BusinessException("所選時段不在該定價配置範圍內");
            }
            java.util.TreeSet<LocalDate> dates = slotDates.computeIfAbsent(item.getSlotKey(), k -> new java.util.TreeSet<>());
            for (LocalDate d : item.getDates()) {
                if (d == null) {
                    throw new BusinessException("購買日期不能為空");
                }
                if (!dates.add(d)) {
                    throw new BusinessException("時段 " + slot.getSlotName() + " 在 " + d + " 重複下單");
                }
            }
        }

        // 2. 日期窗口校驗（預售窗口內）+ 去重天數合計（跨時段同一日期只算一天）
        LocalDate today = LocalDate.now();
        LocalDate windowEnd = today.plusDays((pricing.getPresaleDays() == null ? 7 : pricing.getPresaleDays()) - 1L);
        java.util.TreeSet<LocalDate> distinctDates = new java.util.TreeSet<>();
        for (java.util.TreeSet<LocalDate> dates : slotDates.values()) {
            for (LocalDate d : dates) {
                if (d.isBefore(today) || d.isAfter(windowEnd)) {
                    throw new BusinessException("購買日期 " + d + " 超出預售窗口(" + today + " ~ " + windowEnd + ")");
                }
                distinctDates.add(d);
            }
        }
        LocalDate start = distinctDates.first();
        LocalDate end = distinctDates.last();
        int totalDays = distinctDates.size();
        int cellCount = slotDates.values().stream().mapToInt(java.util.TreeSet::size).sum();

        // 3. 重複購買校驗（同一集團同一時段同一日期，活躍訂單未退）
        Set<String> purchased = purchasedSlots(pricing.getId(), request.getGroupCode(), start, end);
        for (Map.Entry<String, java.util.TreeSet<LocalDate>> en : slotDates.entrySet()) {
            for (LocalDate d : en.getValue()) {
                if (purchased.contains(cellKey(d, en.getKey()))) {
                    throw new BusinessException("時段 " + slotMap.get(en.getKey()).getSlotName()
                            + " 在 " + d + " 已購買，不能重複購買");
                }
            }
        }

        // 4. 計價：每格先套時段折扣，整單再套按購買天數折扣檔位（檔位按去重天數合計匹配）
        BigDecimal originalTotal = BigDecimal.ZERO;
        BigDecimal subtotalAfterSlot = BigDecimal.ZERO;
        for (Map.Entry<String, java.util.TreeSet<LocalDate>> en : slotDates.entrySet()) {
            AdPricingTimeSlotVO.SlotItem s = slotMap.get(en.getKey());
            BigDecimal daily = s.getPrice() == null ? BigDecimal.ZERO : s.getPrice();
            BigDecimal dailyDiscounted = AdCalcRound.round2(daily.multiply(slotFactor(s)));
            int days = en.getValue().size();
            originalTotal = originalTotal.add(AdCalcRound.round2(daily.multiply(BigDecimal.valueOf(days))));
            subtotalAfterSlot = subtotalAfterSlot.add(AdCalcRound.round2(dailyDiscounted.multiply(BigDecimal.valueOf(days))));
        }
        BigDecimal daysFactor = daysDiscountFactor(pricing, totalDays);
        BigDecimal discountedTotal = AdCalcRound.round2(subtotalAfterSlot.multiply(daysFactor));

        // 5. 贈送天數抵扣
        BizStore store = orderSupport.findStore(request.getStoreCode());
        int giftDays = request.getGiftDays() == null ? 0 : request.getGiftDays();
        BigDecimal giftDeduction = orderSupport.calcGiftDeduction(GIFT_AD_TYPE, store, giftDays, cellCount, discountedTotal);
        BigDecimal actualTotal = discountedTotal.subtract(giftDeduction);
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);

        // 6. 推廣金餘額校驗
        orderSupport.requireSufficientBalance(request.getGroupCode(), brand, actualTotal);

        // 7. 寫訂單主表
        LocalDateTime now = LocalDateTime.now();
        String orderNo = bizSeqService.next(BizSeqService.RULE_AD_ORDER_TIMESLOT);
        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(ALGO_TYPE);
        order.setAlgoId(pricing.getId()); // 存定價配置ID
        order.setAlgoName(pricing.getAlgoName());
        order.setAlgoCode(pricing.getPricingNo());
        order.setBrand(brand);
        order.setChannel(channel);
        order.setGroupCode(request.getGroupCode());
        order.setGroupName(orderSupport.resolveGroupName(request.getGroupCode()));
        order.setStoreCode(store != null ? store.getStoreCode() : request.getStoreCode());
        order.setStoreName(store != null ? store.getStoreName() : null);
        order.setBdEmpId(request.getBdEmpId());
        orderSupport.applyOperatorSnapshot(order);
        order.setItemCount(cellCount);
        order.setOriginalAmount(originalTotal);
        order.setDiscountAmount(discountAmount);
        order.setActualAmount(actualTotal);
        order.setRefundAmount(BigDecimal.ZERO);
        order.setGiftDays(giftDays);
        order.setGiftAmount(giftDeduction);
        order.setRefundEnabled(pricing.getRefundEnabled());
        order.setStatus(1); // 待推廣
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        // 8. 寫明細：時段 x 日期逐格（按各條目實際選定日期），按折後價等比分攤實付
        BigDecimal allocated = BigDecimal.ZERO;
        int totalCells = cellCount;
        int idx = 0;
        for (Map.Entry<String, java.util.TreeSet<LocalDate>> en : slotDates.entrySet()) {
            AdPricingTimeSlotVO.SlotItem s = slotMap.get(en.getKey());
            BigDecimal daily = s.getPrice() == null ? BigDecimal.ZERO : s.getPrice();
            BigDecimal cellDiscounted = AdCalcRound.round2(daily.multiply(slotFactor(s)).multiply(daysFactor));
            for (LocalDate d : en.getValue()) {
                idx++;
                BigDecimal salePrice;
                if (idx == totalCells) {
                    salePrice = actualTotal.subtract(allocated);
                } else {
                    salePrice = discountedTotal.signum() == 0 ? BigDecimal.ZERO
                            : AdCalcRound.round2(cellDiscounted.multiply(actualTotal).divide(discountedTotal, RoundingMode.HALF_UP));
                    allocated = allocated.add(salePrice);
                }
                AdOrderItemTimeSlot item = new AdOrderItemTimeSlot();
                item.setOrderId(order.getId());
                item.setOrderNo(orderNo);
                item.setBizDate(d);
                item.setSlotKey(s.getSlotKey());
                item.setSlotName(s.getSlotName());
                item.setOriginalPrice(AdCalcRound.round2(daily));
                item.setSalePrice(salePrice);
                item.setRefundPrice(BigDecimal.ZERO);
                item.setDeliveryStatus(1);
                item.setDeleted(0);
                itemMapper.insert(item);
            }
        }

        // 9. 扣減贈送天數
        orderSupport.deductGiftDays(GIFT_AD_TYPE, store, giftDays, orderNo, pricing.getPricingNo(), pricing.getAlgoName());

        // 10. 扣款 + 寫消費明細
        String finChannel = channel != null && channel == 4 ? "團購" : "外賣";
        orderSupport.writeAdConsume(order, request.getGroupCode(), brand, finChannel,
                actualTotal, "時段推薦", request.getBdEmpId(), now);
        return AdOrderVO.from(order);
    }

    @Override
    public List<String> purchasedCells(Long pricingId, String groupCode) {
        AdPricingTimeSlotVO pricing = pricingService.detailOrNull(pricingId);
        if (pricing == null) {
            return List.of();
        }
        LocalDate today = LocalDate.now();
        LocalDate windowEnd = today.plusDays((pricing.getPresaleDays() == null ? 7 : pricing.getPresaleDays()) - 1L);
        return List.copyOf(purchasedSlots(pricing.getId(), groupCode, today, windowEnd));
    }

    /* ==================== 內部方法 ==================== */

    private AdPricingTimeSlotVO requireActivePricing(Long pricingId) {
        AdPricingTimeSlotVO pricing = pricingService.detail(pricingId);
        if (pricing == null) {
            throw new BusinessException("時段推薦定價配置不存在");
        }
        if (pricing.getStatus() == null || pricing.getStatus() != 1) {
            throw new BusinessException("該時段推薦定價未啟用，無法購買");
        }
        return pricing;
    }

    /** 預售窗口內該集團已購買的活躍時段格子: 日期|slotKey */
    private Set<String> purchasedSlots(Long pricingId, String groupCode, LocalDate start, LocalDate end) {
        Set<String> purchased = new HashSet<>();
        if (!StringUtils.hasText(groupCode)) {
            return purchased;
        }
        List<Long> orderIds = orderMapper.selectList(
                new LambdaQueryWrapper<AdOrder>()
                        .select(AdOrder::getId)
                        .eq(AdOrder::getAlgoId, pricingId)
                        .eq(AdOrder::getGroupCode, groupCode)
                        .in(AdOrder::getStatus, 1, 2))
                .stream().map(AdOrder::getId).toList();
        if (orderIds.isEmpty()) {
            return purchased;
        }
        List<AdOrderItemTimeSlot> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemTimeSlot>()
                        .in(AdOrderItemTimeSlot::getOrderId, orderIds)
                        .ge(AdOrderItemTimeSlot::getBizDate, start)
                        .le(AdOrderItemTimeSlot::getBizDate, end)
                        .in(AdOrderItemTimeSlot::getDeliveryStatus, 1, 2));
        for (AdOrderItemTimeSlot item : items) {
            purchased.add(cellKey(item.getBizDate(), item.getSlotKey()));
        }
        return purchased;
    }

    private static String cellKey(LocalDate date, String slotKey) {
        return date + "|" + slotKey;
    }

    /** 時段折扣系數：折(如 9.5) / 10；未啟用折扣返回 1 */
    private static BigDecimal slotFactor(AdPricingTimeSlotVO.SlotItem s) {
        if (Boolean.TRUE.equals(s.getDiscountEnabled()) && s.getDiscount() != null && s.getDiscount().signum() > 0) {
            return s.getDiscount().divide(BigDecimal.TEN, 4, RoundingMode.HALF_UP);
        }
        return BigDecimal.ONE;
    }

    /** 按購買天數折扣系數：匹配最大 minDays ≤ days 的檔位（折/10），未啟用或無檔位返回 1 */
    private static BigDecimal daysDiscountFactor(AdPricingTimeSlotVO pricing, int days) {
        if (pricing.getDaysDiscountEnabled() == null || pricing.getDaysDiscountEnabled() != 1
                || !StringUtils.hasText(pricing.getDaysDiscountTiers())) {
            return BigDecimal.ONE;
        }
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(pricing.getDaysDiscountTiers());
        tiers.sort((a, b) -> Integer.compare(intOf(b, "minDays"), intOf(a, "minDays")));
        for (Map<String, Object> tier : tiers) {
            if (days >= intOf(tier, "minDays")) {
                BigDecimal discount = decimalOf(tier, "discount");
                if (discount != null && discount.signum() > 0) {
                    return discount.divide(BigDecimal.TEN, 4, RoundingMode.HALF_UP);
                }
            }
        }
        return BigDecimal.ONE;
    }

    private static int intOf(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof Number n ? n.intValue() : 0;
    }

    private static BigDecimal decimalOf(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof Number n ? new BigDecimal(n.toString()) : null;
    }

    /** 金額兩位四捨五入（本地封裝，避免散落 setScale） */
    private static final class AdCalcRound {
        static BigDecimal round2(BigDecimal v) {
            return v == null ? BigDecimal.ZERO : v.setScale(2, RoundingMode.HALF_UP);
        }
    }
}

package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdOrderDetailVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.dto.AdPricingReviveVO;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemHot;
import com.mftb.admin.entity.AdOrderItemNewStore;
import com.mftb.admin.entity.AdOrderItemRevive;
import com.mftb.admin.entity.AdOrderItemStar;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemHotMapper;
import com.mftb.admin.mapper.AdOrderItemNewStoreMapper;
import com.mftb.admin.mapper.AdOrderItemReviveMapper;
import com.mftb.admin.mapper.AdOrderItemStarMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.AdOrderService;
import com.mftb.admin.service.AdPricingHotService;
import com.mftb.admin.service.AdPricingReviveService;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.service.DataScopeService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.util.AdAlgoTypeNames;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.FinExtras;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 推广广告订单服务实现（订单查询 + 退款）
 */
@Service
@RequiredArgsConstructor
public class AdOrderServiceImpl implements AdOrderService {

    private final AdOrderMapper orderMapper;
    private final AdOrderItemStarMapper itemMapper;
    private final AdOrderItemReviveMapper reviveItemMapper;
    private final AdOrderItemNewStoreMapper newStoreItemMapper;
    private final AdOrderItemHotMapper hotItemMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final FinDetailMapper finDetailMapper;
    private final AdPricingStarService pricingService;
    private final AdPricingReviveService revivePricingService;
    private final AdPricingHotService hotPricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final DataScopeService dataScopeService;
    private final BizStoreMapper storeMapper;

    @Override
    public PageResult<AdOrderVO> page(long page, long size, String orderNo, Integer algoType,
                                      String groupCode, String storeCode, Integer status,
                                      String startDate, String endDate) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdOrder> wrapper = new LambdaQueryWrapper<>();
        // 数据范围过滤: 非超管只能看到已授权的商家数据
        Set<String> authorizedGroups = dataScopeService.resolveAuthorizedGroupCodes();
        if (authorizedGroups != null) {
            if (authorizedGroups.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(AdOrder::getGroupCode, authorizedGroups);
        }
        if (StringUtils.hasText(orderNo)) wrapper.like(AdOrder::getOrderNo, orderNo);
        if (algoType != null) wrapper.eq(AdOrder::getAlgoType, algoType);
        if (StringUtils.hasText(groupCode)) wrapper.eq(AdOrder::getGroupCode, groupCode);
        if (StringUtils.hasText(storeCode)) wrapper.eq(AdOrder::getStoreCode, storeCode);
        if (status != null) wrapper.eq(AdOrder::getStatus, status);
        if (StringUtils.hasText(startDate)) wrapper.ge(AdOrder::getOrderTime, LocalDate.parse(startDate).atStartOfDay());
        if (StringUtils.hasText(endDate)) wrapper.le(AdOrder::getOrderTime, LocalDate.parse(endDate).atTime(23, 59, 59));
        wrapper.orderByDesc(AdOrder::getId);

        Page<AdOrder> result = orderMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdOrderVO> records = result.getRecords().stream()
                .map(AdOrderVO::from)
                .toList();
        fillSummaries(records);
        // 动态计算订单真实状态（基于当前时间 + 订单明细的日期/时段）
        for (AdOrderVO vo : records) {
            vo.setStatus(computeEffectiveStatus(vo));
        }
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdOrderDetailVO detail(String orderNo) {
        AdOrder order = require(orderNo);
        AdOrderDetailVO vo = AdOrderDetailVO.from(AdOrderVO.from(order));
        fillSummaries(List.of(vo));
        // 动态计算订单真实状态
        vo.setStatus(computeEffectiveStatus(vo));
        if (isNewStore(order)) {
            List<AdOrderItemNewStore> items = newStoreItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemNewStore>()
                            .eq(AdOrderItemNewStore::getOrderId, order.getId())
                            .orderByAsc(AdOrderItemNewStore::getBizDate));
            items.forEach(item -> vo.getItems().add(AdOrderDetailVO.Item.from(item)));
        } else if (isRevive(order)) {
            List<AdOrderItemRevive> items = reviveItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemRevive>()
                            .eq(AdOrderItemRevive::getOrderId, order.getId())
                            .orderByAsc(AdOrderItemRevive::getBizDate)
                            .orderByAsc(AdOrderItemRevive::getRegion));
            items.forEach(item -> vo.getItems().add(AdOrderDetailVO.Item.from(item)));
        } else if (isHot(order)) {
            List<AdOrderItemHot> items = hotItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemHot>()
                            .eq(AdOrderItemHot::getOrderId, order.getId())
                            .orderByAsc(AdOrderItemHot::getBizDate)
                            .orderByAsc(AdOrderItemHot::getSkinName));
            items.forEach(item -> vo.getItems().add(AdOrderDetailVO.Item.from(item)));
        } else {
            List<AdOrderItemStar> items = itemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemStar>()
                            .eq(AdOrderItemStar::getOrderId, order.getId())
                            .orderByAsc(AdOrderItemStar::getBizDate)
                            .orderByAsc(AdOrderItemStar::getRegion));
            items.forEach(item -> vo.getItems().add(AdOrderDetailVO.Item.from(item)));
        }
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderDetailVO refund(String orderNo) {
        // 悲观锁: SELECT ... FOR UPDATE 防止并发退款
        AdOrder order = orderMapper.selectOne(
                new LambdaQueryWrapper<AdOrder>()
                        .eq(AdOrder::getOrderNo, orderNo)
                        .last("FOR UPDATE"));
        if (order == null) {
            throw new BusinessException("訂單不存在");
        }
        if (order.getStatus() == null || order.getStatus() > 2) {
            throw new BusinessException("當前訂單狀態不可退款");
        }

        // 新店广告退款: 仅标记明细 deliveryStatus=3，无推广金回补（实付为 0）
        if (isNewStore(order)) {
            List<AdOrderItemNewStore> items = newStoreItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemNewStore>()
                            .eq(AdOrderItemNewStore::getOrderId, order.getId())
                            .in(AdOrderItemNewStore::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) {
                throw new BusinessException("訂單沒有可退款的明細");
            }
            for (AdOrderItemNewStore item : items) {
                item.setDeliveryStatus(3);
                newStoreItemMapper.updateById(item);
            }
            order.setStatus(4);
            order.setUpdatedBy(operatorResolver.currentOperatorName());
            orderMapper.updateById(order);
            return detail(orderNo);
        }

        // 退款开关校验（按订单所属算法类型取对应计价配置）
        Integer refundEnabled = null;
        String cancelFeeTiersJson = null;
        if (isRevive(order)) {
            AdPricingReviveVO pricing = revivePricingService.activeByAlgo(order.getAlgoId());
            if (pricing != null) {
                refundEnabled = pricing.getRefundEnabled();
                cancelFeeTiersJson = pricing.getCancelFeeTiers();
            }
        } else if (isHot(order)) {
            AdPricingHotVO pricing = hotPricingService.activeByAlgo(order.getAlgoId());
            if (pricing != null) {
                refundEnabled = pricing.getRefundEnabled();
                cancelFeeTiersJson = pricing.getCancelFeeTiers();
            }
        } else {
            AdPricingStarVO pricing = pricingService.activeByAlgo(order.getAlgoId());
            if (pricing != null) {
                refundEnabled = pricing.getRefundEnabled();
                cancelFeeTiersJson = pricing.getCancelFeeTiers();
            }
        }
        if (refundEnabled != null && refundEnabled == 2) {
            throw new BusinessException("該算法未開放退款");
        }

        FinAccount account = accountService.find(order.getGroupCode(), order.getBrand());
        if (account == null) {
            throw new BusinessException("推廣金賬戶不存在，無法退款");
        }

        // 按取消扣费梯度逐格计算应退金额（剩余天数 = 投放日 - 今天），退款只退实付分摊价
        LocalDate today = LocalDate.now();
        BigDecimal refundTotal = BigDecimal.ZERO;
        if (isRevive(order)) {
            List<AdOrderItemRevive> items = reviveItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemRevive>()
                            .eq(AdOrderItemRevive::getOrderId, order.getId())
                            .in(AdOrderItemRevive::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) {
                throw new BusinessException("訂單沒有可退款的明細");
            }
            for (AdOrderItemRevive item : items) {
                long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
                BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
                BigDecimal refundPrice = round2(item.getSalePrice()
                        .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                        .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
                item.setRefundPrice(refundPrice);
                item.setDeliveryStatus(3); // 已退款 → 释放库存（仅统计活跃明细）
                reviveItemMapper.updateById(item);
                refundTotal = refundTotal.add(refundPrice);
            }
        } else if (isHot(order)) {
            List<AdOrderItemHot> items = hotItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemHot>()
                            .eq(AdOrderItemHot::getOrderId, order.getId())
                            .in(AdOrderItemHot::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) {
                throw new BusinessException("訂單沒有可退款的明細");
            }
            for (AdOrderItemHot item : items) {
                long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
                BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
                BigDecimal refundPrice = round2(item.getSalePrice()
                        .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                        .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
                item.setRefundPrice(refundPrice);
                item.setDeliveryStatus(3); // 已退款 → 释放格子（退款后可再购）
                hotItemMapper.updateById(item);
                refundTotal = refundTotal.add(refundPrice);
            }
        } else {
            List<AdOrderItemStar> items = itemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemStar>()
                            .eq(AdOrderItemStar::getOrderId, order.getId())
                            .in(AdOrderItemStar::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) {
                throw new BusinessException("訂單沒有可退款的明細");
            }
            for (AdOrderItemStar item : items) {
                long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
                BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
                BigDecimal refundPrice = round2(item.getSalePrice()
                        .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                        .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
                item.setRefundPrice(refundPrice);
                item.setDeliveryStatus(3); // 已退款 → 释放格子（库存仅统计活跃明细）
                itemMapper.updateById(item);
                refundTotal = refundTotal.add(refundPrice);
            }
        }

        // 退款上限: 不超过订单实付金额减去已退款金额
        BigDecimal maxRefundable = safe(order.getActualAmount()).subtract(safe(order.getRefundAmount()));
        if (refundTotal.compareTo(maxRefundable) > 0) {
            refundTotal = maxRefundable;
        }
        if (refundTotal.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("可退款金額為 0，無法退款");
        }

        // 回补推广金账户 + 写退款明细（财务写入链: 回退原批次, 实收按批次比例等比例回补）
        LocalDateTime now = LocalDateTime.now();
        String changeType = AdAlgoTypeNames.of(order.getAlgoType());
        String finChannel = order.getChannel() != null && order.getChannel() == 4 ? "團購" : "外賣";
        finWriteChainService.writeAdRefund(
                order.getGroupCode(), order.getGroupName(), order.getBrand(),
                order.getStoreCode(), order.getStoreName(), finChannel,
                refundTotal, changeType, order.getBdEmpId(),
                changeType + "廣告退款 訂單" + order.getOrderNo(), order.getOrderNo(), now);

        order.setRefundAmount(round2(safe(order.getRefundAmount()).add(refundTotal)));
        order.setStatus(4); // 已退款
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        orderMapper.updateById(order);
        return detail(orderNo);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderDetailVO cancel(String orderNo) {
        // 悲观锁: SELECT ... FOR UPDATE 防止并发取消
        AdOrder order = orderMapper.selectOne(
                new LambdaQueryWrapper<AdOrder>()
                        .eq(AdOrder::getOrderNo, orderNo)
                        .last("FOR UPDATE"));
        if (order == null) {
            throw new BusinessException("訂單不存在");
        }
        if (order.getStatus() == null || order.getStatus() > 2) {
            throw new BusinessException("當前訂單狀態不可取消");
        }

        // 新店广告取消: 标记明细 deliveryStatus=3，无推广金回补
        if (isNewStore(order)) {
            List<AdOrderItemNewStore> items = newStoreItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemNewStore>()
                            .eq(AdOrderItemNewStore::getOrderId, order.getId())
                            .in(AdOrderItemNewStore::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) {
                throw new BusinessException("訂單沒有可取消的明細");
            }
            for (AdOrderItemNewStore item : items) {
                item.setDeliveryStatus(3);
                newStoreItemMapper.updateById(item);
            }
            order.setStatus(5); // 已取消
            order.setUpdatedBy(operatorResolver.currentOperatorName());
            orderMapper.updateById(order);
            return detail(orderNo);
        }

        // 取消扣费梯度配置
        String cancelFeeTiersJson = null;
        if (isRevive(order)) {
            AdPricingReviveVO pricing = revivePricingService.activeByAlgo(order.getAlgoId());
            if (pricing != null) cancelFeeTiersJson = pricing.getCancelFeeTiers();
        } else if (isHot(order)) {
            AdPricingHotVO pricing = hotPricingService.activeByAlgo(order.getAlgoId());
            if (pricing != null) cancelFeeTiersJson = pricing.getCancelFeeTiers();
        } else {
            AdPricingStarVO pricing = pricingService.activeByAlgo(order.getAlgoId());
            if (pricing != null) cancelFeeTiersJson = pricing.getCancelFeeTiers();
        }

        FinAccount account = accountService.find(order.getGroupCode(), order.getBrand());
        if (account == null) {
            throw new BusinessException("推廣金賬戶不存在，無法取消");
        }

        // 按取消扣费梯度逐格计算应退金额
        LocalDate today = LocalDate.now();
        BigDecimal refundTotal = BigDecimal.ZERO;
        if (isRevive(order)) {
            List<AdOrderItemRevive> items = reviveItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemRevive>()
                            .eq(AdOrderItemRevive::getOrderId, order.getId())
                            .in(AdOrderItemRevive::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) throw new BusinessException("訂單沒有可取消的明細");
            for (AdOrderItemRevive item : items) {
                long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
                BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
                BigDecimal refundPrice = round2(item.getSalePrice()
                        .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                        .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
                item.setRefundPrice(refundPrice);
                item.setDeliveryStatus(3);
                reviveItemMapper.updateById(item);
                refundTotal = refundTotal.add(refundPrice);
            }
        } else if (isHot(order)) {
            List<AdOrderItemHot> items = hotItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemHot>()
                            .eq(AdOrderItemHot::getOrderId, order.getId())
                            .in(AdOrderItemHot::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) throw new BusinessException("訂單沒有可取消的明細");
            for (AdOrderItemHot item : items) {
                long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
                BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
                BigDecimal refundPrice = round2(item.getSalePrice()
                        .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                        .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
                item.setRefundPrice(refundPrice);
                item.setDeliveryStatus(3);
                hotItemMapper.updateById(item);
                refundTotal = refundTotal.add(refundPrice);
            }
        } else {
            List<AdOrderItemStar> items = itemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemStar>()
                            .eq(AdOrderItemStar::getOrderId, order.getId())
                            .in(AdOrderItemStar::getDeliveryStatus, 1, 2));
            if (items.isEmpty()) throw new BusinessException("訂單沒有可取消的明細");
            for (AdOrderItemStar item : items) {
                long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
                BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
                BigDecimal refundPrice = round2(item.getSalePrice()
                        .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                        .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
                item.setRefundPrice(refundPrice);
                item.setDeliveryStatus(3);
                itemMapper.updateById(item);
                refundTotal = refundTotal.add(refundPrice);
            }
        }

        BigDecimal maxRefundable = safe(order.getActualAmount()).subtract(safe(order.getRefundAmount()));
        if (refundTotal.compareTo(maxRefundable) > 0) refundTotal = maxRefundable;
        if (refundTotal.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("可退款金額為 0，無法取消");
        }

        LocalDateTime now = LocalDateTime.now();
        String changeType = AdAlgoTypeNames.of(order.getAlgoType());
        String finChannel = order.getChannel() != null && order.getChannel() == 4 ? "團購" : "外賣";
        finWriteChainService.writeAdRefund(
                order.getGroupCode(), order.getGroupName(), order.getBrand(),
                order.getStoreCode(), order.getStoreName(), finChannel,
                refundTotal, changeType, order.getBdEmpId(),
                changeType + "廣告取消 訂單" + order.getOrderNo(), order.getOrderNo(), now);

        order.setRefundAmount(round2(safe(order.getRefundAmount()).add(refundTotal)));
        order.setStatus(5); // 已取消
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        orderMapper.updateById(order);
        return detail(orderNo);
    }

    /* ==================== 订单状态动态计算 ==================== */

    /**
     * 根据当前时间和订单明细动态计算订单真实状态。
     * <p>
     * 规则:
     * - 终态(已退款/已取消)直接返回;
     * - 无敌星星(按时段): 最早时段开始时间到达 → 推广中; 最晚时段结束时间已过 → 已推广;
     * - 按天(盘活复苏/新店广告/人气商家): 首日00:00到达 → 推广中; 末日结束 → 已推广。
     */
    private Integer computeEffectiveStatus(AdOrderVO vo) {
        Integer status = vo.getStatus();
        if (status == null) return 1;
        // 终态: 已退款(4) / 已取消(5) 直接返回
        if (status >= 4) return status;

        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();

        if (isStarType(vo.getAlgoType())) {
            // 无敌星星: 按时段判定
            List<AdOrderItemStar> items = itemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemStar>()
                            .eq(AdOrderItemStar::getOrderId, vo.getId()));
            return computeStarEffectiveStatus(items, today, now, status);
        } else if (isReviveType(vo.getAlgoType())) {
            List<AdOrderItemRevive> items = reviveItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemRevive>()
                            .eq(AdOrderItemRevive::getOrderId, vo.getId()));
            return computeDayBasedEffectiveStatus(items.stream().map(AdOrderItemRevive::getBizDate).toList(), today, status);
        } else if (isNewStoreType(vo.getAlgoType())) {
            List<AdOrderItemNewStore> items = newStoreItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemNewStore>()
                            .eq(AdOrderItemNewStore::getOrderId, vo.getId()));
            return computeDayBasedEffectiveStatus(items.stream().map(AdOrderItemNewStore::getBizDate).toList(), today, status);
        } else if (isHotType(vo.getAlgoType())) {
            List<AdOrderItemHot> items = hotItemMapper.selectList(
                    new LambdaQueryWrapper<AdOrderItemHot>()
                            .eq(AdOrderItemHot::getOrderId, vo.getId()));
            return computeDayBasedEffectiveStatus(items.stream().map(AdOrderItemHot::getBizDate).toList(), today, status);
        }
        return status;
    }

    /**
     * 无敌星星(按时段)订单状态计算:
     * - 当前时间 < 最早时段开始时间 → 待推广(1)
     * - 当前时间 > 最晚时段结束时间 → 已推广(3)
     * - 否则 → 推广中(2)
     */
    private static int computeStarEffectiveStatus(List<AdOrderItemStar> items, LocalDate today, LocalDateTime now, int currentStatus) {
        if (items.isEmpty()) return currentStatus;

        // 时段开始小时映射
        Map<String, Integer> slotStartHours = Map.of(
                "breakfast", 6, "lunch", 10, "afternoon", 13, "dinner", 17, "supper", 21);
        // 时段结束小时(下一时段开始): supper结束=24:00
        Map<String, Integer> slotEndHours = Map.of(
                "breakfast", 10, "lunch", 13, "afternoon", 17, "dinner", 21, "supper", 24);

        // 找最早的推广开始时间和最晚的推广结束时间
        LocalDate minDate = items.stream().map(AdOrderItemStar::getBizDate).min(LocalDate::compareTo).orElse(null);
        LocalDate maxDate = items.stream().map(AdOrderItemStar::getBizDate).max(LocalDate::compareTo).orElse(null);
        if (minDate == null || maxDate == null) return currentStatus;

        // 最早日期上的最早时段
        String earliestSlot = items.stream()
                .filter(i -> i.getBizDate().equals(minDate))
                .map(AdOrderItemStar::getMealSlot)
                .min(Comparator.comparingInt(s -> slotStartHours.getOrDefault(s, 0)))
                .orElse("breakfast");
        // 最晚日期上的最晚时段
        String latestSlot = items.stream()
                .filter(i -> i.getBizDate().equals(maxDate))
                .map(AdOrderItemStar::getMealSlot)
                .max(Comparator.comparingInt(s -> slotEndHours.getOrDefault(s, 0)))
                .orElse("supper");

        LocalDateTime promoStart = minDate.atTime(slotStartHours.getOrDefault(earliestSlot, 6), 0);
        int endHour = slotEndHours.getOrDefault(latestSlot, 24);
        LocalDateTime promoEnd = maxDate.atTime(endHour == 24 ? 23 : endHour, endHour == 24 ? 59 : 0, 59);

        if (now.isBefore(promoStart)) return 1; // 待推广
        if (now.isAfter(promoEnd)) return 3;    // 已推广
        return 2;                                // 推广中
    }

    /**
     * 按天订单(盘活复苏/新店广告/人气商家)状态计算:
     * - 今天 < 最早日期 → 待推广(1)
     * - 今天 > 最晚日期 → 已推广(3)
     * - 否则 → 推广中(2)
     */
    private static int computeDayBasedEffectiveStatus(List<LocalDate> dates, LocalDate today, int currentStatus) {
        if (dates.isEmpty()) return currentStatus;
        LocalDate minDate = dates.stream().min(LocalDate::compareTo).orElse(null);
        LocalDate maxDate = dates.stream().max(LocalDate::compareTo).orElse(null);
        if (minDate == null || maxDate == null) return currentStatus;

        if (today.isBefore(minDate)) return 1; // 待推广
        if (today.isAfter(maxDate)) return 3;   // 已推广
        return 2;                                // 推广中
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 列表/详情补充展示字段:
     * 1) 商圈/时段由订单明细去重聚合（盘活复苏无时段维度）;
     * 2) 存量订单无算法编码快照时回查算法表填充
     */
    private void fillSummaries(List<AdOrderVO> records) {
        if (records.isEmpty()) {
            return;
        }
        List<Long> starOrderIds = records.stream()
                .filter(r -> !isReviveType(r.getAlgoType()) && !isNewStoreType(r.getAlgoType())
                        && !isHotType(r.getAlgoType()))
                .map(AdOrderVO::getId).filter(java.util.Objects::nonNull).toList();
        List<Long> reviveOrderIds = records.stream().filter(r -> isReviveType(r.getAlgoType()))
                .map(AdOrderVO::getId).filter(java.util.Objects::nonNull).toList();
        List<Long> newStoreOrderIds = records.stream().filter(r -> isNewStoreType(r.getAlgoType()))
                .map(AdOrderVO::getId).filter(java.util.Objects::nonNull).toList();
        List<Long> hotOrderIds = records.stream().filter(r -> isHotType(r.getAlgoType()))
                .map(AdOrderVO::getId).filter(java.util.Objects::nonNull).toList();
        Map<Long, List<AdOrderItemStar>> byOrder = starOrderIds.isEmpty() ? Map.of()
                : itemMapper.selectList(new LambdaQueryWrapper<AdOrderItemStar>()
                        .in(AdOrderItemStar::getOrderId, starOrderIds))
                .stream().collect(Collectors.groupingBy(AdOrderItemStar::getOrderId));
        Map<Long, List<AdOrderItemRevive>> reviveByOrder = reviveOrderIds.isEmpty() ? Map.of()
                : reviveItemMapper.selectList(new LambdaQueryWrapper<AdOrderItemRevive>()
                        .in(AdOrderItemRevive::getOrderId, reviveOrderIds))
                .stream().collect(Collectors.groupingBy(AdOrderItemRevive::getOrderId));
        Map<Long, List<AdOrderItemNewStore>> newStoreByOrder = newStoreOrderIds.isEmpty() ? Map.of()
                : newStoreItemMapper.selectList(new LambdaQueryWrapper<AdOrderItemNewStore>()
                        .in(AdOrderItemNewStore::getOrderId, newStoreOrderIds))
                .stream().collect(Collectors.groupingBy(AdOrderItemNewStore::getOrderId));
        Map<Long, List<AdOrderItemHot>> hotByOrder = hotOrderIds.isEmpty() ? Map.of()
                : hotItemMapper.selectList(new LambdaQueryWrapper<AdOrderItemHot>()
                        .in(AdOrderItemHot::getOrderId, hotOrderIds))
                .stream().collect(Collectors.groupingBy(AdOrderItemHot::getOrderId));
        for (AdOrderVO vo : records) {
            if (isNewStoreType(vo.getAlgoType())) {
                List<AdOrderItemNewStore> items = newStoreByOrder.getOrDefault(vo.getId(), List.of());
                // 新店廣告無明細商圈 → 回查門店綁定的所在區域
                vo.setMealSlots(new ArrayList<>()); // 新店广告无餐段
                vo.setPurchaseDays(items.stream().map(AdOrderItemNewStore::getBizDate)
                        .filter(java.util.Objects::nonNull).distinct().sorted()
                        .map(Object::toString).toList());
                continue;
            }
            if (isReviveType(vo.getAlgoType())) {
                List<AdOrderItemRevive> items = reviveByOrder.getOrDefault(vo.getId(), List.of());
                vo.setRegions(items.stream().map(AdOrderItemRevive::getRegion)
                        .filter(java.util.Objects::nonNull).distinct().sorted().toList());
                vo.setMealSlots(new ArrayList<>()); // 盘活复苏按天售卖，无时段维度
                // 購買日期列表：明細 biz_date 去重排序，供列表「推廣天數」面板展示
                vo.setPurchaseDays(items.stream().map(AdOrderItemRevive::getBizDate)
                        .filter(java.util.Objects::nonNull).distinct().sorted()
                        .map(Object::toString).toList());
                continue;
            }
            if (isHotType(vo.getAlgoType())) {
                List<AdOrderItemHot> items = hotByOrder.getOrDefault(vo.getId(), List.of());
                vo.setRegions(new ArrayList<>());   // 人气商家无商圈
                vo.setMealSlots(new ArrayList<>()); // 人气商家无餐段
                // 購買日期/皮膚列表：明細去重排序，供列表展示
                vo.setPurchaseDays(items.stream().map(AdOrderItemHot::getBizDate)
                        .filter(java.util.Objects::nonNull).distinct().sorted()
                        .map(Object::toString).toList());
                vo.setSkinNames(items.stream().map(AdOrderItemHot::getSkinName)
                        .filter(java.util.Objects::nonNull).distinct().sorted().toList());
                continue;
            }
            List<AdOrderItemStar> items = byOrder.getOrDefault(vo.getId(), List.of());
            vo.setRegions(items.stream().map(AdOrderItemStar::getRegion)
                    .filter(java.util.Objects::nonNull).distinct().sorted().toList());
            List<String> slots = new ArrayList<>();
            for (String slot : AdSalesStarServiceImpl.MEAL_SLOTS) {
                if (items.stream().anyMatch(i -> slot.equals(i.getMealSlot()))) {
                    slots.add(slot);
                }
            }
            vo.setMealSlots(slots);
        }
        // 新店廣告：從門店綁定區域回填商圈
        List<String> newStoreCodes = records.stream()
                .filter(r -> isNewStoreType(r.getAlgoType()) && StringUtils.hasText(r.getStoreCode()))
                .map(AdOrderVO::getStoreCode).distinct().toList();
        if (!newStoreCodes.isEmpty()) {
            Map<String, Integer> storeRegionMap = storeMapper.selectList(
                    new LambdaQueryWrapper<BizStore>()
                            .in(BizStore::getStoreCode, newStoreCodes)
                            .select(BizStore::getStoreCode, BizStore::getRegion))
                    .stream()
                    .filter(s -> s.getRegion() != null)
                    .collect(Collectors.toMap(BizStore::getStoreCode, BizStore::getRegion, (a, b) -> a));
            records.stream()
                    .filter(r -> isNewStoreType(r.getAlgoType()) && StringUtils.hasText(r.getStoreCode()))
                    .forEach(vo -> {
                        Integer region = storeRegionMap.get(vo.getStoreCode());
                        vo.setRegions(region != null ? List.of(region) : new ArrayList<>());
                    });
        }
        // 存量订单无 algo_code 快照 → 回查算法表补齐
        List<Long> missingAlgoIds = records.stream()
                .filter(r -> !StringUtils.hasText(r.getAlgoCode()) && r.getAlgoId() != null)
                .map(AdOrderVO::getAlgoId).distinct().toList();
        if (!missingAlgoIds.isEmpty()) {
            Map<Long, String> codeMap = algorithmMapper.selectList(
                    new LambdaQueryWrapper<AdAlgorithm>().in(AdAlgorithm::getId, missingAlgoIds))
                    .stream().filter(a -> StringUtils.hasText(a.getAlgoCode()))
                    .collect(Collectors.toMap(AdAlgorithm::getId, AdAlgorithm::getAlgoCode, (a, b) -> a));
            records.forEach(r -> {
                if (!StringUtils.hasText(r.getAlgoCode()) && r.getAlgoId() != null) {
                    r.setAlgoCode(codeMap.get(r.getAlgoId()));
                }
            });
        }
    }

    private AdOrder require(String orderNo) {
        AdOrder order = orderMapper.selectOne(
                new LambdaQueryWrapper<AdOrder>()
                        .eq(AdOrder::getOrderNo, orderNo)
                        .last("LIMIT 1"));
        if (order == null) {
            throw new BusinessException("訂單不存在");
        }
        return order;
    }

    /** 盘活复苏订单（algo_type=3） */
    private static boolean isRevive(AdOrder order) {
        return isReviveType(order.getAlgoType());
    }

    private static boolean isReviveType(Integer algoType) {
        return algoType != null && algoType == 3;
    }

    /** 新店广告订单（algo_type=2） */
    private static boolean isNewStore(AdOrder order) {
        return isNewStoreType(order.getAlgoType());
    }

    private static boolean isNewStoreType(Integer algoType) {
        return algoType != null && algoType == 2;
    }

    /** 人气商家订单（algo_type=5） */
    private static boolean isHot(AdOrder order) {
        return isHotType(order.getAlgoType());
    }

    private static boolean isHotType(Integer algoType) {
        return algoType != null && algoType == 5;
    }

    /** 无敌星星订单（algo_type=1） */
    private static boolean isStarType(Integer algoType) {
        return algoType != null && algoType == 1;
    }

    /**
     * 匹配取消扣费梯度: 按 remainDays 升序取第一个满足「实际剩余天数 <= 梯度天数」的扣费比例
     *
     * @return 扣费比例（0-100）, 无匹配返回 0（全额退）
     */
    private static BigDecimal matchCancelFeeRate(String cancelFeeTiersJson, long remainDays) {
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(cancelFeeTiersJson);
        tiers.sort(Comparator.comparingInt(t -> FinExtras.intOf(t, "remainDays")));
        for (Map<String, Object> tier : tiers) {
            if (remainDays <= FinExtras.intOf(tier, "remainDays")) {
                BigDecimal ratio = FinExtras.decimalOf(tier, "ratio");
                if (ratio != null) {
                    return ratio.min(BigDecimal.valueOf(100)).max(BigDecimal.ZERO);
                }
            }
        }
        return BigDecimal.ZERO;
    }

    private static BigDecimal safe(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static BigDecimal round2(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}

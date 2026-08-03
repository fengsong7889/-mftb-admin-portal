package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdOrderDetailVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemStar;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemStarMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.AdOrderService;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.util.AdAlgoTypeNames;
import com.mftb.admin.util.BizSeqService;
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
import java.util.stream.Collectors;

/**
 * 推广广告订单服务实现（订单查询 + 退款）
 */
@Service
@RequiredArgsConstructor
public class AdOrderServiceImpl implements AdOrderService {

    private final AdOrderMapper orderMapper;
    private final AdOrderItemStarMapper itemMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final FinDetailMapper finDetailMapper;
    private final AdPricingStarService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AdOrderVO> page(long page, long size, String orderNo, Integer algoType,
                                      String groupCode, String storeCode, Integer status,
                                      String startDate, String endDate) {
        LambdaQueryWrapper<AdOrder> wrapper = new LambdaQueryWrapper<>();
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
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdOrderDetailVO detail(String orderNo) {
        AdOrder order = require(orderNo);
        AdOrderDetailVO vo = AdOrderDetailVO.from(AdOrderVO.from(order));
        fillSummaries(List.of(vo));
        List<AdOrderItemStar> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemStar>()
                        .eq(AdOrderItemStar::getOrderId, order.getId())
                        .orderByAsc(AdOrderItemStar::getBizDate)
                        .orderByAsc(AdOrderItemStar::getRegion));
        items.forEach(item -> vo.getItems().add(AdOrderDetailVO.Item.from(item)));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderDetailVO refund(String orderNo) {
        AdOrder order = require(orderNo);
        if (order.getStatus() == null || order.getStatus() > 2) {
            throw new BusinessException("當前訂單狀態不可退款");
        }

        // 退款开关校验（按订单所属算法的计价配置）
        AdPricingStarVO pricing = pricingService.activeByAlgo(order.getAlgoId());
        if (pricing != null && pricing.getRefundEnabled() != null && pricing.getRefundEnabled() == 2) {
            throw new BusinessException("該算法未開放退款");
        }
        String cancelFeeTiersJson = pricing == null ? null : pricing.getCancelFeeTiers();

        FinAccount account = accountService.find(order.getGroupCode(), order.getBrand());
        if (account == null) {
            throw new BusinessException("推廣金賬戶不存在，無法退款");
        }

        List<AdOrderItemStar> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemStar>()
                        .eq(AdOrderItemStar::getOrderId, order.getId())
                        .in(AdOrderItemStar::getDeliveryStatus, 1, 2));
        if (items.isEmpty()) {
            throw new BusinessException("訂單沒有可退款的明細");
        }

        // 按取消扣费梯度逐格计算应退金额（剩余天数 = 投放日 - 今天）
        LocalDate today = LocalDate.now();
        BigDecimal refundTotal = BigDecimal.ZERO;
        for (AdOrderItemStar item : items) {
            long remainDays = ChronoUnit.DAYS.between(today, item.getBizDate());
            BigDecimal feeRate = matchCancelFeeRate(cancelFeeTiersJson, remainDays);
            BigDecimal refundPrice = round2(item.getSalePrice()
                    .multiply(BigDecimal.valueOf(100).subtract(feeRate))
                    .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
            item.setRefundPrice(refundPrice);
            item.setDeliveryStatus(3); // 已退款 → 释放格子（独家占仅统计活跃明细）
            itemMapper.updateById(item);
            refundTotal = refundTotal.add(refundPrice);
        }

        // 回补推广金账户 + 写退款明细（财务写入链: 回退原批次, 实收按批次比例等比例回补）
        LocalDateTime now = LocalDateTime.now();
        String changeType = AdAlgoTypeNames.of(order.getAlgoType());
        finWriteChainService.writeAdRefund(
                order.getGroupCode(), order.getGroupName(), order.getBrand(),
                order.getStoreCode(), order.getStoreName(), "外賣",
                refundTotal, changeType, order.getBdEmpId(),
                changeType + "廣告退款 訂單" + order.getOrderNo(), order.getOrderNo(), now);

        order.setRefundAmount(round2(safe(order.getRefundAmount()).add(refundTotal)));
        order.setStatus(4); // 已退款
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        orderMapper.updateById(order);
        return detail(orderNo);
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 列表/详情补充展示字段:
     * 1) 商圈/时段由订单明细去重聚合;
     * 2) 存量订单无算法编码快照时回查算法表填充
     */
    private void fillSummaries(List<AdOrderVO> records) {
        if (records.isEmpty()) {
            return;
        }
        List<Long> orderIds = records.stream().map(AdOrderVO::getId).filter(java.util.Objects::nonNull).toList();
        Map<Long, List<AdOrderItemStar>> byOrder = orderIds.isEmpty() ? Map.of()
                : itemMapper.selectList(new LambdaQueryWrapper<AdOrderItemStar>()
                        .in(AdOrderItemStar::getOrderId, orderIds))
                .stream().collect(Collectors.groupingBy(AdOrderItemStar::getOrderId));
        for (AdOrderVO vo : records) {
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

    /**
     * 匹配取消扣费梯度: 按 remainDays 升序取第一个满足「实际剩余天数 <= 梯度天数」的扣费比例
     *
     * @return 扣费比例（0-100）, 无匹配返回 0（全额退）
     */
    private static BigDecimal matchCancelFeeRate(String cancelFeeTiersJson, long remainDays) {
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(cancelFeeTiersJson);
        tiers.sort(Comparator.comparingInt(t -> intOf(t, "remainDays")));
        for (Map<String, Object> tier : tiers) {
            if (remainDays <= intOf(tier, "remainDays")) {
                BigDecimal ratio = decimalOf(tier, "ratio");
                if (ratio != null) {
                    return ratio.min(BigDecimal.valueOf(100)).max(BigDecimal.ZERO);
                }
            }
        }
        return BigDecimal.ZERO;
    }

    private static int intOf(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value instanceof Number number ? number.intValue() : Integer.MAX_VALUE;
    }

    private static BigDecimal decimalOf(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        return null;
    }

    private static BigDecimal safe(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static BigDecimal round2(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}

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
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.AdOrderItemStarMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.AdOrderService;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.service.FinAccountService;
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
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 推广广告订单服务实现（订单查询 + 退款）
 */
@Service
@RequiredArgsConstructor
public class AdOrderServiceImpl implements AdOrderService {

    private final AdOrderMapper orderMapper;
    private final AdOrderItemStarMapper itemMapper;
    private final FinDetailMapper finDetailMapper;
    private final AdPricingStarService pricingService;
    private final FinAccountService accountService;
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
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdOrderDetailVO detail(String orderNo) {
        AdOrder order = require(orderNo);
        AdOrderDetailVO vo = AdOrderDetailVO.from(AdOrderVO.from(order));
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

        // 回补推广金账户 + 写退款明细（与购买消费明细同类型正负相抵）
        LocalDateTime now = LocalDateTime.now();
        FinDetail detail = new FinDetail();
        detail.setDetailId(bizSeqService.next(BizSeqService.PREFIX_DETAIL));
        detail.setGroupCode(order.getGroupCode());
        detail.setGroupName(order.getGroupName());
        detail.setBrand(order.getBrand());
        detail.setStoreCode(StringUtils.hasText(order.getStoreCode()) ? order.getStoreCode() : "--");
        detail.setStoreName(StringUtils.hasText(order.getStoreName()) ? order.getStoreName() : "--");
        detail.setChannel("外賣");
        detail.setTradeType("消費");
        detail.setChangeType("廣告退款");
        detail.setTradeTime(now);
        detail.setVirtualChange(refundTotal);
        detail.setFlowNo(order.getOrderNo());
        detail.setBd(StringUtils.hasText(order.getBdEmpId()) ? order.getBdEmpId() : "--");
        detail.setRemark("無敵星星廣告退款 訂單" + order.getOrderNo());
        finDetailMapper.insert(detail);

        accountService.changeBalance(order.getGroupCode(), order.getBrand(), refundTotal, null);

        order.setRefundAmount(round2(safe(order.getRefundAmount()).add(refundTotal)));
        order.setStatus(4); // 已退款
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        orderMapper.updateById(order);
        return detail(orderNo);
    }

    /* ==================== 内部方法 ==================== */

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

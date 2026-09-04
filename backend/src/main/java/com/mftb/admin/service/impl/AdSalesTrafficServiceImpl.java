package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdTrafficOrderRequest;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemTraffic;
import com.mftb.admin.entity.AdPricingTraffic;
import com.mftb.admin.entity.AdPricingTrafficLadder;
import com.mftb.admin.entity.AdPricingTrafficTier;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdOrderItemTrafficMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.AdPricingTrafficLadderMapper;
import com.mftb.admin.mapper.AdPricingTrafficMapper;
import com.mftb.admin.mapper.AdPricingTrafficTierMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdSalesTrafficService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.AdCalcUtils;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 投流广告销售服务实现（流量包购买下单扣款）
 * <p>
 * 售卖单位: 曝光次数（预付流量包），无商圈/日期/餐段维度，不限库存。
 * 购买方式二选一: 预设档位(套餐价, 支持限时折扣) / 自定义曝光数量(阶梯单价)。
 * 金额全部由服务端按定价配置计算，不信任客户端传入金额。
 */
@Service
@RequiredArgsConstructor
public class AdSalesTrafficServiceImpl implements AdSalesTrafficService {

    /** 赠送管理中投流广告的广告类型标识（biz_gift_record.ad_type） */
    public static final String GIFT_AD_TYPE = "traffic_ad";

    /** 投流定价配置固定算法类型 */
    public static final int ALGO_TYPE_TRAFFIC = 15;

    /** 赠送天数每日折算价值配置键（缺省 150 MOP/天） */
    private static final String GIFT_DAY_VALUE_KEY = "payment_traffic_gift_day_value";
    private static final BigDecimal DEFAULT_GIFT_DAY_VALUE = BigDecimal.valueOf(150);

    private final AdOrderMapper orderMapper;
    private final AdOrderItemTrafficMapper itemMapper;
    private final AdPricingTrafficMapper pricingMapper;
    private final AdPricingTrafficTierMapper tierMapper;
    private final AdPricingTrafficLadderMapper ladderMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final GiftService giftService;
    private final SysConfigService sysConfigService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdTrafficOrderRequest request) {
        // 1. 定价配置校验（必须启用中）
        AdPricingTraffic pricing = pricingMapper.selectById(request.getPricingId());
        if (pricing == null) {
            throw new BusinessException("該定價配置不存在");
        }
        if (pricing.getStatus() == null || pricing.getStatus() != 1) {
            throw new BusinessException("該頻道流量包已停售");
        }

        // 2. 计价: 预设档位 / 自定义曝光数量（服务端计价）
        boolean tierMode = "tier".equals(request.getMode());
        boolean customMode = "custom".equals(request.getMode());
        if (!tierMode && !customMode) {
            throw new BusinessException("非法的購買方式: " + request.getMode());
        }
        String packageName;
        int impressions;
        BigDecimal originalTotal;
        if (tierMode) {
            if (request.getTierId() == null) {
                throw new BusinessException("請選擇流量包檔位");
            }
            AdPricingTrafficTier tier = tierMapper.selectOne(
                    new LambdaQueryWrapper<AdPricingTrafficTier>()
                            .eq(AdPricingTrafficTier::getId, request.getTierId())
                            .eq(AdPricingTrafficTier::getPricingId, pricing.getId())
                            .last("LIMIT 1"));
            if (tier == null) {
                throw new BusinessException("流量包檔位不存在");
            }
            if (tier.getOnSale() == null || tier.getOnSale() != 1) {
                throw new BusinessException("流量包檔位已下架: " + tier.getTierName());
            }
            packageName = tier.getTierName();
            impressions = tier.getImpressions();
            // 档位折扣生效时按折后价计价，原价与折后价差额计入折扣优惠
            BigDecimal discounted = tierDiscountedPrice(tier, LocalDate.now());
            originalTotal = discounted.compareTo(tier.getPrice()) < 0
                    ? discounted : tier.getPrice();
        } else {
            if (request.getImpressions() == null || request.getImpressions() < 1) {
                throw new BusinessException("請輸入自定義曝光次數");
            }
            int minQty = pricing.getCustomMinQty() == null ? 1 : pricing.getCustomMinQty();
            if (request.getImpressions() < minQty) {
                throw new BusinessException("曝光次數不能低於最低起購量 " + minQty);
            }
            AdPricingTrafficLadder row = matchLadder(pricing.getId(), request.getImpressions());
            if (row == null) {
                throw new BusinessException("未配置匹配的階梯單價，無法計價");
            }
            packageName = "自定義曝光次數";
            impressions = request.getImpressions();
            originalTotal = AdCalcUtils.round2(row.getUnitPrice()
                    .multiply(BigDecimal.valueOf(impressions)));
        }

        // 3. 赠送天数抵扣: 按每日折算价值抵扣（投流按曝光计价无天数维度）
        int giftDays = request.getGiftDays() == null ? 0 : request.getGiftDays();
        BizStore store = StringUtils.hasText(request.getStoreCode())
                ? storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                        .eq(BizStore::getStoreCode, request.getStoreCode())
                        .last("LIMIT 1"))
                : null;
        BigDecimal giftDeduction = BigDecimal.ZERO;
        if (giftDays > 0) {
            if (store == null) {
                throw new BusinessException("請選擇門店後再使用贈送天數抵扣");
            }
            int available = giftService.availableDays(store.getId(), GIFT_AD_TYPE);
            if (available < giftDays) {
                throw new BusinessException("贈送天數餘額不足，當前可用 " + available + " 天");
            }
            BigDecimal giftDayValue = giftDayValue();
            int maxUsable = originalTotal.signum() > 0
                    ? originalTotal.add(giftDayValue).subtract(BigDecimal.ONE)
                            .divide(giftDayValue, 0, RoundingMode.FLOOR).intValue()
                    : 0;
            if (giftDays > maxUsable) {
                giftDays = maxUsable;
            }
            giftDeduction = giftDayValue.multiply(BigDecimal.valueOf(giftDays));
            if (giftDeduction.compareTo(originalTotal) > 0) {
                giftDeduction = originalTotal;
            }
        }
        BigDecimal actualTotal = originalTotal.subtract(giftDeduction);
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);

        // 4. 推广金账户校验 + 余额校验（仅实际需要推广金时才检查账户状态）
        if (actualTotal.signum() > 0) {
            FinAccount account = accountService.requireUsable(request.getGroupCode(), pricing.getBrand());
            BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
            if (balance.compareTo(actualTotal) < 0) {
                throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
            }
        }

        // 5. 写订单主表 + 明细
        LocalDateTime now = LocalDateTime.now();
        String orderNo = bizSeqService.next(BizSeqService.RULE_AD_ORDER_TRAFFIC);
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, request.getGroupCode())
                        .last("LIMIT 1"));

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(ALGO_TYPE_TRAFFIC);
        order.setAlgoId(pricing.getId()); // 存定价配置ID，用于回查业务频道/退款配置
        order.setAlgoName(pricing.getAlgoName());
        order.setAlgoCode(pricing.getPricingNo()); // 存定价编号，用于订单列表展示"配置ID"
        order.setBrand(pricing.getBrand());
        // 订单频道统一语义: 2=外賣 3=超市百貨 4=團購（业务频道 1/2/3 映射）
        order.setChannel(trafficOrderChannel(pricing.getBizChannel()));
        order.setGroupCode(request.getGroupCode());
        order.setGroupName(group != null ? group.getGroupName() : request.getGroupCode());
        order.setStoreCode(store != null ? store.getStoreCode() : request.getStoreCode());
        order.setStoreName(store != null ? store.getStoreName() : null);
        order.setBdEmpId(request.getBdEmpId());
        // 下单人快照: 当前登录的业务人员
        SysUser operator = operatorResolver.currentUser();
        if (operator != null) {
            order.setOperatorType(2);
            order.setOperatorId(StringUtils.hasText(operator.getEmpId()) ? operator.getEmpId() : operator.getUsername());
            order.setOperatorName(StringUtils.hasText(operator.getName()) ? operator.getName() : operator.getUsername());
        }
        order.setItemCount(1);
        order.setOriginalAmount(originalTotal);
        order.setDiscountAmount(discountAmount);
        order.setActualAmount(actualTotal);
        order.setRefundAmount(BigDecimal.ZERO);
        order.setGiftDays(giftDays);
        order.setGiftAmount(giftDeduction);
        order.setRefundEnabled(pricing.getRefundEnabled()); // 退款开关快照
        order.setStatus(1); // 初始状态=待推广，查询时动态计算为投放中
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        // 实际单价 = 实付金额 ÷ 购买曝光（退款按此单价折算剩余曝光价值）
        BigDecimal unitPrice = impressions > 0
                ? actualTotal.divide(BigDecimal.valueOf(impressions), 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        AdOrderItemTraffic item = new AdOrderItemTraffic();
        item.setOrderId(order.getId());
        item.setOrderNo(orderNo);
        item.setMode(tierMode ? "tier" : "custom");
        item.setPackageName(packageName);
        item.setImpressions(impressions);
        item.setUnitPrice(unitPrice);
        item.setDeliverySlot(StringUtils.hasText(request.getDeliverySlot())
                ? request.getDeliverySlot() : "business");
        item.setOriginalPrice(originalTotal);
        item.setSalePrice(actualTotal);
        item.setRefundPrice(BigDecimal.ZERO);
        item.setRefundFeePercent(pricing.getRefundFeePercent() == null ? 0 : pricing.getRefundFeePercent());
        item.setConsumedImpressions(0);
        item.setDeliveryStatus(1);
        item.setDeleted(0);
        itemMapper.insert(item);

        // 6. 扣减赠送天数余额并写消费流水（与订单同事务）
        if (giftDays > 0 && store != null) {
            giftService.deductForOrder(store.getId(), GIFT_AD_TYPE, giftDays, orderNo,
                    pricing.getPricingNo(), pricing.getAlgoName());
        }

        // 7. 扣款 + 写消费明细（财务写入链: 按充值批次 FIFO 拆分挂批次号, 变动类别=投流廣告）
        String changeType = "投流廣告";
        String finChannel = Integer.valueOf(4).equals(order.getChannel()) ? "團購" : "外賣";
        if (actualTotal.signum() > 0) {
            String firstDetailId = finWriteChainService.writeAdConsume(
                    request.getGroupCode(), order.getGroupName(), pricing.getBrand(),
                    order.getStoreCode(), order.getStoreName(), finChannel,
                    actualTotal, changeType, request.getBdEmpId(),
                    changeType + "廣告購買 訂單" + orderNo, orderNo, now);
            order.setFlowNo(firstDetailId);
            orderMapper.updateById(order);
        }
        return AdOrderVO.from(order);
    }

    /* ==================== 内部方法 ==================== */

    /** 业务频道 → 订单频道: 1=美食外賣→2, 2=超市百貨→3, 3=團購到店→4 */
    static Integer trafficOrderChannel(Integer bizChannel) {
        if (bizChannel == null) {
            return null;
        }
        return switch (bizChannel) {
            case 2 -> 3;
            case 3 -> 4;
            default -> 2;
        };
    }

    /** 按购买数量匹配阶梯单价: qty >= minQty 且 (maxQty=0 或 qty <= maxQty) */
    private AdPricingTrafficLadder matchLadder(Long pricingId, int qty) {
        List<AdPricingTrafficLadder> rows = ladderMapper.selectList(
                new LambdaQueryWrapper<AdPricingTrafficLadder>()
                        .eq(AdPricingTrafficLadder::getPricingId, pricingId)
                        .orderByAsc(AdPricingTrafficLadder::getMinQty));
        for (AdPricingTrafficLadder row : rows) {
            int min = row.getMinQty() == null ? 0 : row.getMinQty();
            int max = row.getMaxQty() == null ? 0 : row.getMaxQty();
            if (qty >= min && (max == 0 || qty <= max)) {
                return row;
            }
        }
        return null;
    }

    /** 赠送天数每日折算价值（系统配置，缺省 150 MOP/天） */
    private BigDecimal giftDayValue() {
        String value = sysConfigService.getConfigValue(GIFT_DAY_VALUE_KEY);
        if (!StringUtils.hasText(value)) {
            return DEFAULT_GIFT_DAY_VALUE;
        }
        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            return DEFAULT_GIFT_DAY_VALUE;
        }
    }

    /** 档位折后价: 折扣开启且(不限时间 或 今天在折扣期内)时生效 */
    static BigDecimal tierDiscountedPrice(AdPricingTrafficTier tier, LocalDate today) {
        BigDecimal price = tier.getPrice() == null ? BigDecimal.ZERO : tier.getPrice();
        if (tier.getDiscountEnabled() == null || tier.getDiscountEnabled() != 1
                || tier.getDiscount() == null || tier.getDiscount().compareTo(BigDecimal.TEN) >= 0) {
            return price;
        }
        if ("limited".equals(tier.getDiscountTimeMode())) {
            if (tier.getDiscountStartDate() != null && today.isBefore(tier.getDiscountStartDate())) {
                return price;
            }
            if (tier.getDiscountEndDate() != null && today.isAfter(tier.getDiscountEndDate())) {
                return price;
            }
        }
        return AdCalcUtils.round2(price.multiply(tier.getDiscount())
                .divide(BigDecimal.TEN, RoundingMode.HALF_UP));
    }
}

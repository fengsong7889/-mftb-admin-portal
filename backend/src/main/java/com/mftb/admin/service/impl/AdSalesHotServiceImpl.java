package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdHotInventoryVO;
import com.mftb.admin.dto.AdHotOrderRequest;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemHot;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdOrderItemHotMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdPricingHotService;
import com.mftb.admin.service.AdSalesHotService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.util.AdCalcUtils;
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
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 人气商家广告销售服务实现（库存查询 + 下单扣款）
 * <p>
 * 售卖单位: 皮肤 x 日期（无商圈/餐段维度），不限库存，多商家可同时购买同一格子，
 * 但同一商家(集团)已购买的「皮肤x日期」不能重复购买（退款释放后可再购）。
 * 梯度折扣按购买格子数匹配，实付从推广金账户扣款。
 */
@Service
@RequiredArgsConstructor
public class AdSalesHotServiceImpl implements AdSalesHotService {

    /** 赠送管理中人气商家的广告类型标识（biz_gift_record.ad_type） */
    public static final String GIFT_AD_TYPE = "popular_merchant";

    private final AdOrderMapper orderMapper;
    private final AdOrderItemHotMapper itemMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final AdPricingHotService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final GiftService giftService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdHotInventoryVO inventory(Long algoId, String storeCode, String groupCode) {
        AdPricingHotVO pricing = requireActivePricing(algoId);
        if (pricing.getSkins().isEmpty()) {
            throw new BusinessException("該算法未配置皮膚計價");
        }
        // 屏蔽商家拦截
        requireNotBlocked(pricing, storeCode, groupCode);

        LocalDate today = LocalDate.now();
        // 仅预售期内可售
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Set<String> purchased = purchasedCells(algoId, groupCode, today, endDate);

        AdHotInventoryVO vo = new AdHotInventoryVO();
        vo.setAlgoId(algoId);
        vo.setPresaleDays(pricing.getPresaleDays());
        vo.setGiftCashValue(pricing.getGiftCashValue());
        vo.setDiscountTiers(pricing.getDiscountTiers());
        vo.setRefundEnabled(pricing.getRefundEnabled());
        for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
            for (AdPricingHotVO.SkinPriceItem skin : pricing.getSkins()) {
                AdHotInventoryVO.Cell cell = new AdHotInventoryVO.Cell();
                cell.setBizDate(date);
                cell.setSkinName(skin.getSkinName());
                cell.setPrice(skin.getPrice());
                cell.setBorderType(skin.getBorderType());
                cell.setBorderColor(skin.getBorderColor());
                cell.setTier(skin.getTier());
                cell.setDishLayout(skin.getDishLayout());
                boolean bought = StringUtils.hasText(groupCode)
                        && purchased.contains(cellKey(date, skin.getSkinName()));
                cell.setStatus(bought ? "purchased" : "available");
                vo.getCells().add(cell);
            }
        }
        // 保证前端按日期/皮肤稳定渲染
        vo.getCells().sort(Comparator.comparing(AdHotInventoryVO.Cell::getBizDate)
                .thenComparing(AdHotInventoryVO.Cell::getSkinName));
        // 皮肤销量统计: 有效订单(未退款未取消)每单每个皮肤记一次
        vo.setSkinSoldCounts(skinSoldCounts(algoId));
        return vo;
    }

    /* ==================== 下单扣款 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdHotOrderRequest request) {
        AdPricingHotVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getSkins().isEmpty()) {
            throw new BusinessException("該算法未配置皮膚計價");
        }
        // 解耦算法库：品牌/频道/名称均从定价记录获取
        String brand = pricing.getBrand();
        Integer channel = pricing.getChannel();
        // 屏蔽商家拦截
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());

        // 2. 格子去重 + 窗口/皮肤定价校验
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Map<String, BigDecimal> skinPrice = new LinkedHashMap<>();
        for (AdPricingHotVO.SkinPriceItem skin : pricing.getSkins()) {
            skinPrice.put(skin.getSkinName(), skin.getPrice());
        }
        Set<String> requestKeys = new HashSet<>();
        for (AdHotOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || !StringUtils.hasText(cell.getSkinName())) {
                throw new BusinessException("格子信息不完整");
            }
            if (cell.getBizDate().isBefore(today) || cell.getBizDate().isAfter(endDate)) {
                throw new BusinessException("購買日期超出預售窗口(" + today + " ~ " + endDate + ")");
            }
            if (!skinPrice.containsKey(cell.getSkinName())) {
                throw new BusinessException("皮膚未配置計價: " + cell.getSkinName());
            }
            if (!requestKeys.add(cellKey(cell.getBizDate(), cell.getSkinName()))) {
                throw new BusinessException("選購格子重複（同一皮膚同一日期只能購買一次）");
            }
        }

        // 3. 重复购买校验: 同商家已购买的「皮肤x日期」不能重复购买（退款释放后可再购）
        Set<String> purchased = purchasedCells(request.getAlgoId(), request.getGroupCode(), today, endDate);
        for (String key : requestKeys) {
            if (purchased.contains(key)) {
                throw new BusinessException("該皮膚在所选日期已購買，不能重複購買");
            }
        }

        // 4. 计价: 皮肤日单价合计 → 按购买格子数匹配梯度折扣
        BigDecimal originalTotal = BigDecimal.ZERO;
        Map<String, BigDecimal> cellPriceMap = new LinkedHashMap<>();
        for (AdHotOrderRequest.CellSelection cell : request.getCells()) {
            BigDecimal price = AdCalcUtils.round2(skinPrice.get(cell.getSkinName()));
            String key = cellKey(cell.getBizDate(), cell.getSkinName());
            cellPriceMap.put(key, price);
            originalTotal = originalTotal.add(price);
        }
        BigDecimal discountPercent = AdCalcUtils.matchDiscountTier(pricing.getDiscountTiers(), "minDays", request.getCells().size());
        BigDecimal discountedTotal = AdCalcUtils.round2(originalTotal.multiply(discountPercent)
                .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));

        // 5. 赠送天数抵扣: 按折后日均价折算，封顶折后总额（赠送部分不走推广金，退款不返还）
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
            if (giftDays > request.getCells().size()) {
                throw new BusinessException("抵扣天數不能超過購買天數");
            }
            giftDeduction = AdCalcUtils.round2(discountedTotal
                    .multiply(BigDecimal.valueOf(giftDays))
                    .divide(BigDecimal.valueOf(request.getCells().size()), RoundingMode.HALF_UP));
            if (giftDeduction.compareTo(discountedTotal) > 0) {
                giftDeduction = discountedTotal;
            }
        }
        BigDecimal actualTotal = discountedTotal.subtract(giftDeduction);
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);

        // 6. 推广金账户校验 + 余额校验（仅实际需要推广金时才检查账户状态）
        if (actualTotal.signum() > 0) {
            FinAccount account = accountService.requireUsable(request.getGroupCode(), brand);
            BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
            if (balance.compareTo(actualTotal) < 0) {
                throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
            }
        }

        // 7. 写订单主表 + 明细
        String orderNo = bizSeqService.next(BizSeqService.RULE_AD_ORDER_POPULAR);
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, request.getGroupCode())
                        .last("LIMIT 1"));

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(5); // 人氣商家固定类型
        order.setAlgoId(pricing.getId()); // 解耦後存定價配置ID，用於已購格子查詢
        order.setAlgoName(pricing.getAlgoName());
        order.setAlgoCode(pricing.getPricingNo()); // 存定价编号，用于订单列表展示"配置ID"
        order.setBrand(brand);
        order.setChannel(channel);
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
        order.setItemCount(request.getCells().size());
        order.setOriginalAmount(originalTotal);
        order.setDiscountAmount(discountAmount);
        order.setActualAmount(actualTotal);
        order.setRefundAmount(BigDecimal.ZERO);
        order.setGiftDays(giftDays);
        order.setGiftAmount(giftDeduction);
        order.setRefundEnabled(pricing.getRefundEnabled()); // 退款开关快照
        order.setStatus(1); // 初始状态=待推广，查询时动态计算真实状态
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        // 明细实付按折后价等比分摊（尾差修正保证合计 = 实付，退款只退推广金部分）
        BigDecimal allocated = BigDecimal.ZERO;
        List<AdHotOrderRequest.CellSelection> cells = request.getCells();
        for (int i = 0; i < cells.size(); i++) {
            AdHotOrderRequest.CellSelection cell = cells.get(i);
            String key = cellKey(cell.getBizDate(), cell.getSkinName());
            BigDecimal salePrice;
            if (i == cells.size() - 1) {
                salePrice = actualTotal.subtract(allocated);
            } else {
                salePrice = discountedTotal.signum() == 0 ? BigDecimal.ZERO
                        : AdCalcUtils.round2(cellPriceMap.get(key).multiply(discountPercent)
                                .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP)
                                .multiply(actualTotal)
                                .divide(discountedTotal, RoundingMode.HALF_UP));
                allocated = allocated.add(salePrice);
            }
            AdOrderItemHot item = new AdOrderItemHot();
            item.setOrderId(order.getId());
            item.setOrderNo(orderNo);
            item.setBizDate(cell.getBizDate());
            item.setSkinName(cell.getSkinName());
            item.setOriginalPrice(cellPriceMap.get(key));
            item.setSalePrice(salePrice);
            item.setRefundPrice(BigDecimal.ZERO);
            item.setDeliveryStatus(1);
            item.setDeleted(0);
            itemMapper.insert(item);
        }

        // 8. 扣减赠送天数余额并写消费流水（与订单同事务）
        if (giftDays > 0 && store != null) {
            giftService.deductForOrder(store.getId(), GIFT_AD_TYPE, giftDays, orderNo,
                    pricing.getPricingNo(), pricing.getAlgoName());
        }

        // 9. 扣款 + 写消费明细（财务写入链: 按充值批次 FIFO 拆分挂批次号, 变动类别=广告类型）
        String changeType = "人氣商家";
        String finChannel = channel != null && channel == 4 ? "團購" : "外賣";
        if (actualTotal.signum() > 0) {
            String firstDetailId = finWriteChainService.writeAdConsume(
                    request.getGroupCode(), order.getGroupName(), brand,
                    order.getStoreCode(), order.getStoreName(), finChannel,
                    actualTotal, changeType, request.getBdEmpId(),
                    changeType + "廣告購買 訂單" + orderNo, orderNo, now);
            order.setFlowNo(firstDetailId);
            orderMapper.updateById(order);
        }
        return AdOrderVO.from(order);
    }

    /* ==================== 内部方法 ==================== */

    private AdPricingHotVO requireActivePricing(Long pricingId) {
        AdPricingHotVO pricing = pricingService.detail(pricingId);
        if (pricing == null) {
            throw new BusinessException("該定價配置不存在");
        }
        if (pricing.getStatus() == null || pricing.getStatus() != 1) {
            throw new BusinessException("該定價配置未啟用");
        }
        return pricing;
    }

    /** 预售窗口内该商家(集团)已购买的活跃格子集合: 日期|皮肤 */
    private Set<String> purchasedCells(Long algoId, String groupCode, LocalDate start, LocalDate end) {
        Set<String> purchased = new HashSet<>();
        if (!StringUtils.hasText(groupCode)) {
            return purchased;
        }
        List<Long> orderIds = orderMapper.selectList(
                new LambdaQueryWrapper<AdOrder>()
                        .select(AdOrder::getId)
                        .eq(AdOrder::getAlgoId, algoId)
                        .eq(AdOrder::getGroupCode, groupCode)
                        .in(AdOrder::getStatus, 1, 2))
                .stream().map(AdOrder::getId).toList();
        if (orderIds.isEmpty()) {
            return purchased;
        }
        List<AdOrderItemHot> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemHot>()
                        .in(AdOrderItemHot::getOrderId, orderIds)
                        .ge(AdOrderItemHot::getBizDate, start)
                        .le(AdOrderItemHot::getBizDate, end)
                        .in(AdOrderItemHot::getDeliveryStatus, 1, 2));
        for (AdOrderItemHot item : items) {
            purchased.add(cellKey(item.getBizDate(), item.getSkinName()));
        }
        return purchased;
    }

    /** 皮膚銷量統計: 有效訂單(待推廣/推廣中/已推廣)中每單每個皮膚記一次 */
    private Map<String, Integer> skinSoldCounts(Long algoId) {
        Map<String, Integer> soldCounts = new LinkedHashMap<>();
        List<Long> orderIds = orderMapper.selectList(
                new LambdaQueryWrapper<AdOrder>()
                        .select(AdOrder::getId)
                        .eq(AdOrder::getAlgoId, algoId)
                        .in(AdOrder::getStatus, 1, 2, 3))
                .stream().map(AdOrder::getId).toList();
        if (orderIds.isEmpty()) {
            return soldCounts;
        }
        List<AdOrderItemHot> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemHot>()
                        .in(AdOrderItemHot::getOrderId, orderIds)
                        .in(AdOrderItemHot::getDeliveryStatus, 1, 2));
        // 同一訂單同一皮膚只記一次（一單多天只算一單銷量）
        Set<String> counted = new HashSet<>();
        for (AdOrderItemHot item : items) {
            if (counted.add(item.getOrderId() + "|" + item.getSkinName())) {
                soldCounts.merge(item.getSkinName(), 1, Integer::sum);
            }
        }
        return soldCounts;
    }

    /** 屏蔽商家校验: 开关启用且命中屏蔽名单时禁止购买 */
    private void requireNotBlocked(AdPricingHotVO pricing, String storeCode, String groupCode) {
        if (pricing.getBlockMerchant() == null || pricing.getBlockMerchant() != 1) {
            return;
        }
        for (Map<String, Object> entry : JsonUtils.parseMapList(pricing.getBlockList())) {
            String entryStore = entry.get("storeCode") == null ? null : String.valueOf(entry.get("storeCode"));
            String entryGroup = entry.get("groupCode") == null ? null : String.valueOf(entry.get("groupCode"));
            if (StringUtils.hasText(storeCode) && storeCode.equals(entryStore)) {
                throw new BusinessException("該商家已被屏蔽，無法購買該算法廣告");
            }
            if (StringUtils.hasText(groupCode) && groupCode.equals(entryGroup)) {
                throw new BusinessException("該商家已被屏蔽，無法購買該算法廣告");
            }
        }
    }

    /** 格子唯一键: 日期|皮肤 */
    private static String cellKey(LocalDate date, String skinName) {
        return date + "|" + skinName;
    }
}

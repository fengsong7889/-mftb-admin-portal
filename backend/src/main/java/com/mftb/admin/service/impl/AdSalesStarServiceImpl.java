package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdInventoryVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.AdStarOrderRequest;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemStar;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemStarMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.service.AdSalesStarService;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 无敌星星广告销售服务实现（库存查询 + 下单扣款）
 * <p>
 * 售卖单位: 商圈 x 日期 x 5餐段时段, 独家占（应用层校验, 退款后释放）。
 * 格子单价 = 商圈日单价 / 5, 多选格子按梯度折扣计价后从推广金账户扣款。
 */
@Service
@RequiredArgsConstructor
public class AdSalesStarServiceImpl implements AdSalesStarService {

    /** 5 个餐段时段 */
    public static final List<String> MEAL_SLOTS = List.of("breakfast", "lunch", "afternoon", "dinner", "supper");

    private final AdAlgorithmMapper algorithmMapper;
    private final AdOrderMapper orderMapper;
    private final AdOrderItemStarMapper itemMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final FinDetailMapper finDetailMapper;
    private final AdPricingStarService pricingService;
    private final FinAccountService accountService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdInventoryVO inventory(Long algoId) {
        AdAlgorithm algorithm = requireActiveAlgorithm(algoId);
        AdPricingStarVO pricing = requireActivePricing(algoId);
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }

        LocalDate today = LocalDate.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Set<String> occupied = occupiedCells(today, endDate);

        AdInventoryVO vo = new AdInventoryVO();
        vo.setAlgoId(algoId);
        vo.setPresaleDays(pricing.getPresaleDays());
        vo.setDiscountTiers(pricing.getDiscountTiers());
        for (AdPricingStarVO.RegionPriceItem regionPrice : pricing.getRegionPrices()) {
            BigDecimal cellPrice = round2(regionPrice.getDailyPrice()
                    .divide(BigDecimal.valueOf(MEAL_SLOTS.size()), RoundingMode.HALF_UP));
            for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
                for (String slot : MEAL_SLOTS) {
                    AdInventoryVO.Cell cell = new AdInventoryVO.Cell();
                    cell.setBizDate(date);
                    cell.setRegion(regionPrice.getRegion());
                    cell.setMealSlot(slot);
                    cell.setCellPrice(cellPrice);
                    cell.setStatus(occupied.contains(cellKey(date, regionPrice.getRegion(), slot))
                            ? "soldOut" : "available");
                    vo.getCells().add(cell);
                }
            }
        }
        // 保证前端按日期/商圈/餐段稳定渲染
        vo.getCells().sort(Comparator.comparing(AdInventoryVO.Cell::getBizDate)
                .thenComparing(AdInventoryVO.Cell::getRegion)
                .thenComparing(c -> MEAL_SLOTS.indexOf(c.getMealSlot())));
        return vo;
    }

    /* ==================== 下单扣款 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdStarOrderRequest request) {
        AdAlgorithm algorithm = requireActiveAlgorithm(request.getAlgoId());
        AdPricingStarVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }
        String brand = algorithm.getBrand();

        // 1. 推广金账户可用校验
        FinAccount account = accountService.requireUsable(request.getGroupCode(), brand);

        // 2. 格子去重 + 窗口/定价校验
        LocalDate today = LocalDate.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Map<Integer, BigDecimal> regionDailyPrice = new LinkedHashMap<>();
        for (AdPricingStarVO.RegionPriceItem item : pricing.getRegionPrices()) {
            regionDailyPrice.put(item.getRegion(), item.getDailyPrice());
        }
        Set<String> requestKeys = new HashSet<>();
        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || cell.getRegion() == null || !StringUtils.hasText(cell.getMealSlot())) {
                throw new BusinessException("格子信息不完整");
            }
            if (!MEAL_SLOTS.contains(cell.getMealSlot())) {
                throw new BusinessException("非法的餐段时段: " + cell.getMealSlot());
            }
            if (cell.getBizDate().isBefore(today) || cell.getBizDate().isAfter(endDate)) {
                throw new BusinessException("購買日期超出預售窗口(" + today + " ~ " + endDate + ")");
            }
            if (!regionDailyPrice.containsKey(cell.getRegion())) {
                throw new BusinessException("商圈未配置計價");
            }
            if (!requestKeys.add(cellKey(cell.getBizDate(), cell.getRegion(), cell.getMealSlot()))) {
                throw new BusinessException("選購格子重複");
            }
        }

        // 3. 独家占校验（仅活跃订单占用格子）
        Set<String> occupied = occupiedCells(today, endDate);
        for (String key : requestKeys) {
            if (occupied.contains(key)) {
                throw new BusinessException("部分格子已售罄，請刷新後重新選擇");
            }
        }

        // 4. 梯度折扣计价
        BigDecimal cellUnitDivisor = BigDecimal.valueOf(MEAL_SLOTS.size());
        BigDecimal originalTotal = BigDecimal.ZERO;
        Map<String, BigDecimal> cellPriceMap = new LinkedHashMap<>();
        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            BigDecimal cellPrice = round2(regionDailyPrice.get(cell.getRegion())
                    .divide(cellUnitDivisor, RoundingMode.HALF_UP));
            cellPriceMap.put(cellKey(cell.getBizDate(), cell.getRegion(), cell.getMealSlot()), cellPrice);
            originalTotal = originalTotal.add(cellPrice);
        }
        BigDecimal discountPercent = matchDiscountTier(pricing.getDiscountTiers(), request.getCells().size());
        BigDecimal actualTotal = round2(originalTotal.multiply(discountPercent)
                .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);

        // 5. 余额校验
        BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
        if (balance.compareTo(actualTotal) < 0) {
            throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
        }

        // 6. 写订单主表 + 明细
        LocalDateTime now = LocalDateTime.now();
        String orderNo = bizSeqService.next(BizSeqService.PREFIX_AD_ORDER);
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, request.getGroupCode())
                        .last("LIMIT 1"));
        BizStore store = StringUtils.hasText(request.getStoreCode())
                ? storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                        .eq(BizStore::getStoreCode, request.getStoreCode())
                        .last("LIMIT 1"))
                : null;

        LocalDate minDate = request.getCells().stream()
                .map(AdStarOrderRequest.CellSelection::getBizDate).min(LocalDate::compareTo).orElse(today);
        LocalDate maxDate = request.getCells().stream()
                .map(AdStarOrderRequest.CellSelection::getBizDate).max(LocalDate::compareTo).orElse(today);

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(algorithm.getAlgoType());
        order.setAlgoId(algorithm.getId());
        order.setAlgoName(algorithm.getAlgoName());
        order.setBrand(brand);
        order.setChannel(algorithm.getChannel());
        order.setGroupCode(request.getGroupCode());
        order.setGroupName(group != null ? group.getGroupName() : request.getGroupCode());
        order.setStoreCode(store != null ? store.getStoreCode() : request.getStoreCode());
        order.setStoreName(store != null ? store.getStoreName() : null);
        order.setBdEmpId(request.getBdEmpId());
        order.setItemCount(request.getCells().size());
        order.setOriginalAmount(originalTotal);
        order.setDiscountAmount(discountAmount);
        order.setActualAmount(actualTotal);
        order.setRefundAmount(BigDecimal.ZERO);
        order.setStatus(!minDate.isAfter(today) && !maxDate.isBefore(today) ? 2 : 1);
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            String key = cellKey(cell.getBizDate(), cell.getRegion(), cell.getMealSlot());
            BigDecimal originalPrice = cellPriceMap.get(key);
            BigDecimal salePrice = round2(originalPrice.multiply(discountPercent)
                    .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
            AdOrderItemStar item = new AdOrderItemStar();
            item.setOrderId(order.getId());
            item.setOrderNo(orderNo);
            item.setBizDate(cell.getBizDate());
            item.setRegion(cell.getRegion());
            item.setMealSlot(cell.getMealSlot());
            item.setOriginalPrice(originalPrice);
            item.setSalePrice(salePrice);
            item.setRefundPrice(BigDecimal.ZERO);
            item.setDeliveryStatus(1);
            item.setDeleted(0);
            itemMapper.insert(item);
        }

        // 7. 扣款 + 写消费明细（接入现有财务写入链, 出现在交易明细与充消对账）
        String detailId = bizSeqService.next(BizSeqService.PREFIX_DETAIL);
        FinDetail detail = new FinDetail();
        detail.setDetailId(detailId);
        detail.setGroupCode(request.getGroupCode());
        detail.setGroupName(order.getGroupName());
        detail.setBrand(brand);
        detail.setStoreCode(StringUtils.hasText(order.getStoreCode()) ? order.getStoreCode() : "--");
        detail.setStoreName(StringUtils.hasText(order.getStoreName()) ? order.getStoreName() : "--");
        detail.setChannel("外賣");
        detail.setTradeType("消費");
        detail.setChangeType("廣告消費");
        detail.setTradeTime(now);
        detail.setVirtualChange(actualTotal.negate());
        detail.setFlowNo(orderNo);
        detail.setBd(StringUtils.hasText(request.getBdEmpId()) ? request.getBdEmpId() : "--");
        detail.setRemark("無敵星星廣告購買 訂單" + orderNo);
        finDetailMapper.insert(detail);

        accountService.changeBalance(request.getGroupCode(), brand, actualTotal.negate(), null);

        order.setFlowNo(detailId);
        orderMapper.updateById(order);
        return AdOrderVO.from(order);
    }

    /* ==================== 内部方法 ==================== */

    private AdAlgorithm requireActiveAlgorithm(Long algoId) {
        AdAlgorithm algorithm = algorithmMapper.selectById(algoId);
        if (algorithm == null) {
            throw new BusinessException("算法不存在");
        }
        if (algorithm.getStatus() == null || algorithm.getStatus() != 1) {
            throw new BusinessException("算法已停用，無法購買");
        }
        return algorithm;
    }

    private AdPricingStarVO requireActivePricing(Long algoId) {
        AdPricingStarVO pricing = pricingService.activeByAlgo(algoId);
        if (pricing == null) {
            throw new BusinessException("該算法未配置銷售定價");
        }
        return pricing;
    }

    /** 预售窗口内被活跃订单（未退款）占用的格子集合 */
    private Set<String> occupiedCells(LocalDate start, LocalDate end) {
        List<AdOrderItemStar> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemStar>()
                        .ge(AdOrderItemStar::getBizDate, start)
                        .le(AdOrderItemStar::getBizDate, end)
                        .in(AdOrderItemStar::getDeliveryStatus, 1, 2));
        Set<String> keys = new HashSet<>();
        for (AdOrderItemStar item : items) {
            keys.add(cellKey(item.getBizDate(), item.getRegion(), item.getMealSlot()));
        }
        return keys;
    }

    /** 格子唯一键: 日期|商圈|餐段 */
    private static String cellKey(LocalDate date, Integer region, String slot) {
        return date + "|" + region + "|" + slot;
    }

    /**
     * 匹配多时段梯度折扣: 按 minSlots 降序取第一个满足「格子数 >= minSlots」的梯度
     *
     * @return 折扣百分比（如 95 = 95折）, 无匹配返回 100
     */
    private static BigDecimal matchDiscountTier(String discountTiersJson, int cellCount) {
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(discountTiersJson);
        tiers.sort((a, b) -> Integer.compare(intOf(b, "minSlots"), intOf(a, "minSlots")));
        for (Map<String, Object> tier : tiers) {
            if (cellCount >= intOf(tier, "minSlots")) {
                BigDecimal discount = decimalOf(tier, "discount");
                if (discount != null && discount.compareTo(BigDecimal.ZERO) > 0) {
                    return discount;
                }
            }
        }
        return BigDecimal.valueOf(100);
    }

    private static int intOf(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static BigDecimal decimalOf(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        return null;
    }

    private static BigDecimal round2(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}

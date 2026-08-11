package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdHotInventoryVO;
import com.mftb.admin.dto.AdHotOrderRequest;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemHot;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemHotMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdPricingHotService;
import com.mftb.admin.service.AdSalesHotService;
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

    private final AdAlgorithmMapper algorithmMapper;
    private final AdOrderMapper orderMapper;
    private final AdOrderItemHotMapper itemMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final AdPricingHotService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdHotInventoryVO inventory(Long algoId, String storeCode, String groupCode) {
        requireActiveAlgorithm(algoId);
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
        vo.setDiscountTiers(pricing.getDiscountTiers());
        vo.setRefundEnabled(pricing.getRefundEnabled());
        for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
            for (AdPricingHotVO.SkinPriceItem skin : pricing.getSkins()) {
                AdHotInventoryVO.Cell cell = new AdHotInventoryVO.Cell();
                cell.setBizDate(date);
                cell.setSkinName(skin.getSkinName());
                cell.setPrice(skin.getPrice());
                boolean bought = StringUtils.hasText(groupCode)
                        && purchased.contains(cellKey(date, skin.getSkinName()));
                cell.setStatus(bought ? "purchased" : "available");
                vo.getCells().add(cell);
            }
        }
        // 保证前端按日期/皮肤稳定渲染
        vo.getCells().sort(Comparator.comparing(AdHotInventoryVO.Cell::getBizDate)
                .thenComparing(AdHotInventoryVO.Cell::getSkinName));
        return vo;
    }

    /* ==================== 下单扣款 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdHotOrderRequest request) {
        AdAlgorithm algorithm = requireActiveAlgorithm(request.getAlgoId());
        AdPricingHotVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getSkins().isEmpty()) {
            throw new BusinessException("該算法未配置皮膚計價");
        }
        String brand = algorithm.getBrand();
        // 屏蔽商家拦截
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());

        // 1. 推广金账户可用校验
        FinAccount account = accountService.requireUsable(request.getGroupCode(), brand);

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
            BigDecimal price = round2(skinPrice.get(cell.getSkinName()));
            String key = cellKey(cell.getBizDate(), cell.getSkinName());
            cellPriceMap.put(key, price);
            originalTotal = originalTotal.add(price);
        }
        BigDecimal discountPercent = matchCellTier(pricing.getDiscountTiers(), request.getCells().size());
        BigDecimal discountedTotal = round2(originalTotal.multiply(discountPercent)
                .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
        BigDecimal actualTotal = discountedTotal;
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);

        // 5. 余额校验
        BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
        if (balance.compareTo(actualTotal) < 0) {
            throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
        }

        // 6. 写订单主表 + 明细
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

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(algorithm.getAlgoType());
        order.setAlgoId(algorithm.getId());
        order.setAlgoName(algorithm.getAlgoName());
        order.setAlgoCode(algorithm.getAlgoCode());
        order.setBrand(brand);
        order.setChannel(algorithm.getChannel());
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
                        : round2(cellPriceMap.get(key).multiply(discountPercent)
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

        // 7. 扣款 + 写消费明细（财务写入链: 按充值批次 FIFO 拆分挂批次号, 变动类别=广告类型）
        String changeType = AdAlgoTypeNames.of(algorithm.getAlgoType());
        String finChannel = algorithm.getChannel() != null && algorithm.getChannel() == 4 ? "團購" : "外賣";
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

    private AdPricingHotVO requireActivePricing(Long algoId) {
        AdPricingHotVO pricing = pricingService.activeByAlgo(algoId);
        if (pricing == null) {
            throw new BusinessException("該算法未配置銷售定價");
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

    /**
     * 匹配梯度折扣: 按 minDays 降序取第一个满足「格子数 >= minDays」的梯度
     *
     * @return 折扣百分比（如 95 = 95折）, 无匹配返回 100
     */
    private static BigDecimal matchCellTier(String discountTiersJson, int cellCount) {
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(discountTiersJson);
        tiers.sort((a, b) -> Integer.compare(intOf(b, "minDays"), intOf(a, "minDays")));
        for (Map<String, Object> tier : tiers) {
            if (cellCount >= intOf(tier, "minDays")) {
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

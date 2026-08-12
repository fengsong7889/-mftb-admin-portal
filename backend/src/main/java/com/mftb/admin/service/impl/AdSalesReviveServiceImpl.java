package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingReviveVO;
import com.mftb.admin.dto.AdReviveInventoryVO;
import com.mftb.admin.dto.AdReviveOrderRequest;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdDayLockRevive;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemRevive;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdDayLockReviveMapper;
import com.mftb.admin.mapper.AdOrderItemReviveMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdPricingReviveService;
import com.mftb.admin.service.AdSalesReviveService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.util.AdAlgoTypeNames;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
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
 * 盘活复苏广告销售服务实现（库存查询 + 加购锁 + 下单扣款）
 * <p>
 * 售卖单位: 商圈 x 日期（无餐段维度），按商圈每日销售个数(dailySalesLimit)控制库存。
 * 多天梯度折扣按购买天数匹配，赠送天数抵扣按折后日均价折算后从推广金账户扣实付。
 */
@Service
@RequiredArgsConstructor
public class AdSalesReviveServiceImpl implements AdSalesReviveService {

    /** 加购锁定时长（秒）: 商家加购后锁定格子，其它商家额度被占用，到期自动释放 */
    private static final long LOCK_SECONDS = 60L;

    /** 赠送管理中盘活复苏的广告类型标识（biz_gift_record.ad_type） */
    public static final String GIFT_AD_TYPE = "revival";

    private final AdAlgorithmMapper algorithmMapper;
    private final AdDayLockReviveMapper lockMapper;
    private final AdOrderMapper orderMapper;
    private final AdOrderItemReviveMapper itemMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final AdPricingReviveService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final GiftService giftService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdReviveInventoryVO inventory(Long algoId, String storeCode, String groupCode) {
        requireActiveAlgorithm(algoId);
        AdPricingReviveVO pricing = requireActivePricing(algoId);
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }
        // 屏蔽商家拦截
        requireNotBlocked(pricing, storeCode, groupCode);

        LocalDate today = LocalDate.now();
        // 仅预售期内可售；仅遍历定价已配置商圈
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Map<String, Integer> occupied = occupiedCounts(today, endDate);
        Map<String, Set<String>> lockGroups = activeLockGroups(algoId, today, endDate);

        AdReviveInventoryVO vo = new AdReviveInventoryVO();
        vo.setAlgoId(algoId);
        vo.setPresaleDays(pricing.getPresaleDays());
        vo.setDiscountTiers(pricing.getDiscountTiers());
        vo.setRefundEnabled(pricing.getRefundEnabled());
        for (AdPricingReviveVO.RegionPriceItem regionPrice : pricing.getRegionPrices()) {
            int salesLimit = regionPrice.getDailySalesLimit() == null || regionPrice.getDailySalesLimit() < 1
                    ? 1 : regionPrice.getDailySalesLimit();
            for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
                AdReviveInventoryVO.Cell cell = new AdReviveInventoryVO.Cell();
                cell.setBizDate(date);
                cell.setRegion(regionPrice.getRegion());
                cell.setDailyPrice(regionPrice.getDailyPrice());
                cell.setSalesLimit(salesLimit);
                int taken = takenCount(cellKey(date, regionPrice.getRegion()), occupied, lockGroups, groupCode);
                cell.setRemaining(Math.max(0, salesLimit - taken));
                cell.setStatus(taken >= salesLimit ? "soldOut" : "available");
                vo.getCells().add(cell);
            }
        }
        // 保证前端按日期/商圈稳定渲染
        vo.getCells().sort(Comparator.comparing(AdReviveInventoryVO.Cell::getBizDate)
                .thenComparing(AdReviveInventoryVO.Cell::getRegion));
        return vo;
    }

    /* ==================== 下单扣款 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdReviveOrderRequest request) {
        AdAlgorithm algorithm = requireActiveAlgorithm(request.getAlgoId());
        AdPricingReviveVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }
        String brand = algorithm.getBrand();
        // 屏蔽商家拦截
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());

        // 2. 格子去重 + 窗口/定价校验
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Map<Integer, BigDecimal> regionDailyPrice = new LinkedHashMap<>();
        Map<Integer, Integer> regionSalesLimit = new LinkedHashMap<>();
        for (AdPricingReviveVO.RegionPriceItem item : pricing.getRegionPrices()) {
            regionDailyPrice.put(item.getRegion(), item.getDailyPrice());
            regionSalesLimit.put(item.getRegion(), item.getDailySalesLimit() == null || item.getDailySalesLimit() < 1
                    ? 1 : item.getDailySalesLimit());
        }
        Set<String> requestKeys = new HashSet<>();
        for (AdReviveOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || cell.getRegion() == null) {
                throw new BusinessException("格子信息不完整");
            }
            if (cell.getBizDate().isBefore(today) || cell.getBizDate().isAfter(endDate)) {
                throw new BusinessException("購買日期超出預售窗口(" + today + " ~ " + endDate + ")");
            }
            if (!regionDailyPrice.containsKey(cell.getRegion())) {
                throw new BusinessException("商圈未配置計價");
            }
            if (!requestKeys.add(cellKey(cell.getBizDate(), cell.getRegion()))) {
                throw new BusinessException("選購日期重複");
            }
        }

        // 3. 库存校验（活跃订单占用）+ 其它商家加购锁校验
        Map<String, Integer> occupied = occupiedCounts(today, endDate);
        Map<String, Set<String>> lockGroups = activeLockGroups(request.getAlgoId(), today, endDate);
        for (String key : requestKeys) {
            int taken = takenCount(key, occupied, lockGroups, request.getGroupCode());
            int limit = salesLimitOfKey(key, regionSalesLimit);
            if (taken >= limit) {
                throw new BusinessException("部分日期已售罄，請刷新後重新選擇");
            }
        }

        // 4. 计价: 日单价合计 → 按购买天数匹配多天梯度折扣
        BigDecimal originalTotal = BigDecimal.ZERO;
        Map<String, BigDecimal> cellPriceMap = new LinkedHashMap<>();
        for (AdReviveOrderRequest.CellSelection cell : request.getCells()) {
            BigDecimal dayPrice = round2(regionDailyPrice.get(cell.getRegion()));
            String key = cellKey(cell.getBizDate(), cell.getRegion());
            cellPriceMap.put(key, dayPrice);
            originalTotal = originalTotal.add(dayPrice);
        }
        BigDecimal discountPercent = matchDayTier(pricing.getDiscountTiers(), request.getCells().size());
        BigDecimal discountedTotal = round2(originalTotal.multiply(discountPercent)
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
            giftDeduction = round2(discountedTotal
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
        String orderNo = bizSeqService.next(BizSeqService.PREFIX_AD_ORDER);
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, request.getGroupCode())
                        .last("LIMIT 1"));

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
        order.setGiftDays(giftDays);
        order.setGiftAmount(giftDeduction);
        order.setStatus(1); // 初始状态=待推广，查询时动态计算真实状态
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        // 明细实付按抵扣后实付等比分摊（尾差修正保证合计 = 实付，退款只退推广金部分）
        BigDecimal allocated = BigDecimal.ZERO;
        List<AdReviveOrderRequest.CellSelection> cells = request.getCells();
        for (int i = 0; i < cells.size(); i++) {
            AdReviveOrderRequest.CellSelection cell = cells.get(i);
            String key = cellKey(cell.getBizDate(), cell.getRegion());
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
            AdOrderItemRevive item = new AdOrderItemRevive();
            item.setOrderId(order.getId());
            item.setOrderNo(orderNo);
            item.setBizDate(cell.getBizDate());
            item.setRegion(cell.getRegion());
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
                    algorithm.getAlgoCode(), algorithm.getAlgoName());
        }

        // 9. 扣款 + 写消费明细（财务写入链: 按充值批次 FIFO 拆分挂批次号, 变动类别=广告类型）
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

        // 10. 下单成功后释放本商家对这些格子的加购锁
        releaseLocks(request.getAlgoId(), request.getGroupCode(), request.getCells());
        return AdOrderVO.from(order);
    }

    /* ==================== 加购锁定（60秒） ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void lockCells(AdReviveOrderRequest request) {
        requireActiveAlgorithm(request.getAlgoId());
        AdPricingReviveVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());

        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Set<Integer> configuredRegions = new HashSet<>();
        Map<Integer, Integer> regionSalesLimit = new LinkedHashMap<>();
        for (AdPricingReviveVO.RegionPriceItem item : pricing.getRegionPrices()) {
            configuredRegions.add(item.getRegion());
            regionSalesLimit.put(item.getRegion(), item.getDailySalesLimit() == null || item.getDailySalesLimit() < 1
                    ? 1 : item.getDailySalesLimit());
        }
        Map<String, Integer> occupied = occupiedCounts(today, endDate);
        Map<String, Set<String>> lockGroups = activeLockGroups(request.getAlgoId(), today, endDate);

        Set<String> seen = new HashSet<>();
        for (AdReviveOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || cell.getRegion() == null) {
                throw new BusinessException("格子信息不完整");
            }
            if (cell.getBizDate().isBefore(today) || cell.getBizDate().isAfter(endDate)) {
                throw new BusinessException("鎖定日期超出預售窗口");
            }
            if (!configuredRegions.contains(cell.getRegion())) {
                throw new BusinessException("商圈未配置計價");
            }
            String key = cellKey(cell.getBizDate(), cell.getRegion());
            if (!seen.add(key)) {
                continue; // 同一批次重复加购同一格子视为续期
            }
            int taken = takenCount(key, occupied, lockGroups, request.getGroupCode());
            int limit = regionSalesLimit.getOrDefault(cell.getRegion(), 1);
            if (taken >= limit) {
                throw new BusinessException("該日期已售罄");
            }
        }

        LocalDateTime expireAt = now.plusSeconds(LOCK_SECONDS);
        for (AdReviveOrderRequest.CellSelection cell : request.getCells()) {
            // 先清理该格子的过期锁与本人旧锁，再写入新锁（续期）
            lockMapper.delete(new LambdaQueryWrapper<AdDayLockRevive>()
                    .eq(AdDayLockRevive::getAlgoId, request.getAlgoId())
                    .eq(AdDayLockRevive::getBizDate, cell.getBizDate())
                    .eq(AdDayLockRevive::getRegion, cell.getRegion())
                    .and(w -> w.le(AdDayLockRevive::getExpireAt, now)
                            .or().eq(AdDayLockRevive::getGroupCode, request.getGroupCode())));
            AdDayLockRevive lock = new AdDayLockRevive();
            lock.setAlgoId(request.getAlgoId());
            lock.setBizDate(cell.getBizDate());
            lock.setRegion(cell.getRegion());
            lock.setGroupCode(request.getGroupCode());
            lock.setStoreCode(request.getStoreCode());
            lock.setExpireAt(expireAt);
            try {
                lockMapper.insert(lock);
            } catch (DuplicateKeyException e) {
                throw new BusinessException("該日期已被其他商家加購鎖定，請稍後再試");
            }
        }
    }

    @Override
    public void unlockCells(AdReviveOrderRequest request) {
        for (AdReviveOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || cell.getRegion() == null) {
                continue;
            }
            lockMapper.delete(new LambdaQueryWrapper<AdDayLockRevive>()
                    .eq(AdDayLockRevive::getAlgoId, request.getAlgoId())
                    .eq(AdDayLockRevive::getGroupCode, request.getGroupCode())
                    .eq(AdDayLockRevive::getBizDate, cell.getBizDate())
                    .eq(AdDayLockRevive::getRegion, cell.getRegion()));
        }
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

    private AdPricingReviveVO requireActivePricing(Long algoId) {
        AdPricingReviveVO pricing = pricingService.activeByAlgo(algoId);
        if (pricing == null) {
            throw new BusinessException("該算法未配置銷售定價");
        }
        return pricing;
    }

    /** 预售窗口内被活跃订单（未退款）占用的格子计数: 格子键 → 占用个数 */
    private Map<String, Integer> occupiedCounts(LocalDate start, LocalDate end) {
        List<AdOrderItemRevive> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemRevive>()
                        .ge(AdOrderItemRevive::getBizDate, start)
                        .le(AdOrderItemRevive::getBizDate, end)
                        .in(AdOrderItemRevive::getDeliveryStatus, 1, 2));
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (AdOrderItemRevive item : items) {
            counts.merge(cellKey(item.getBizDate(), item.getRegion()), 1, Integer::sum);
        }
        return counts;
    }

    /** 预售窗口内未过期的加购锁: 格子键 → 持锁集团集合 */
    private Map<String, Set<String>> activeLockGroups(Long algoId, LocalDate start, LocalDate end) {
        List<AdDayLockRevive> locks = lockMapper.selectList(
                new LambdaQueryWrapper<AdDayLockRevive>()
                        .eq(AdDayLockRevive::getAlgoId, algoId)
                        .ge(AdDayLockRevive::getBizDate, start)
                        .le(AdDayLockRevive::getBizDate, end)
                        .gt(AdDayLockRevive::getExpireAt, LocalDateTime.now()));
        Map<String, Set<String>> map = new LinkedHashMap<>();
        for (AdDayLockRevive lock : locks) {
            map.computeIfAbsent(cellKey(lock.getBizDate(), lock.getRegion()),
                    k -> new HashSet<>()).add(lock.getGroupCode());
        }
        return map;
    }

    /** 格子已被占用个数: 活跃订单占用 + 其它商家加购锁（本商家锁不占用自己的可购额度） */
    private static int takenCount(String key, Map<String, Integer> occupied,
                                  Map<String, Set<String>> lockGroups, String viewerGroupCode) {
        int taken = occupied.getOrDefault(key, 0);
        Set<String> groups = lockGroups.get(key);
        if (groups != null) {
            for (String group : groups) {
                if (!group.equals(viewerGroupCode)) {
                    taken++;
                }
            }
        }
        return taken;
    }

    /** 下单成功后释放本商家的加购锁 */
    private void releaseLocks(Long algoId, String groupCode, List<AdReviveOrderRequest.CellSelection> cells) {
        for (AdReviveOrderRequest.CellSelection cell : cells) {
            lockMapper.delete(new LambdaQueryWrapper<AdDayLockRevive>()
                    .eq(AdDayLockRevive::getAlgoId, algoId)
                    .eq(AdDayLockRevive::getGroupCode, groupCode)
                    .eq(AdDayLockRevive::getBizDate, cell.getBizDate())
                    .eq(AdDayLockRevive::getRegion, cell.getRegion()));
        }
    }

    /** 屏蔽商家校验: 开关启用且命中屏蔽名单时禁止购买 */
    private void requireNotBlocked(AdPricingReviveVO pricing, String storeCode, String groupCode) {
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

    /** 格子唯一键: 日期|商圈 */
    private static String cellKey(LocalDate date, Integer region) {
        return date + "|" + region;
    }

    /** 从格子键(日期|商圈)提取商圈并取库存上限 */
    private static int salesLimitOfKey(String key, Map<Integer, Integer> regionSalesLimit) {
        String[] parts = key.split("\\|");
        if (parts.length >= 2) {
            try {
                return regionSalesLimit.getOrDefault(Integer.parseInt(parts[1]), 1);
            } catch (NumberFormatException ignored) {
            }
        }
        return 1;
    }

    /**
     * 匹配多天梯度折扣: 按 minDays 降序取第一个满足「天数 >= minDays」的梯度
     *
     * @return 折扣百分比（如 95 = 95折）, 无匹配返回 100
     */
    private static BigDecimal matchDayTier(String discountTiersJson, int dayCount) {
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(discountTiersJson);
        tiers.sort((a, b) -> Integer.compare(intOf(b, "minDays"), intOf(a, "minDays")));
        for (Map<String, Object> tier : tiers) {
            if (dayCount >= intOf(tier, "minDays")) {
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

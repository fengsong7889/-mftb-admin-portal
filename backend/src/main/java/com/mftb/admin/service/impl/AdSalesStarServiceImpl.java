package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdInventoryVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.AdStarOrderRequest;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdCellLock;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemStar;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdCellLockMapper;
import com.mftb.admin.mapper.AdOrderItemStarMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.service.AdSalesStarService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.util.AdAlgoTypeNames;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
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
 * 售卖单位: 商圈 x 日期 x 5餐段时段, 按商圈每日销售个数(dailySalesLimit)控制库存，
 * 默认 1 即独家占；退款/取消后释放可再售。
 * 格子单价 = 商圈日单价 / 5, 多选格子按梯度折扣计价后从推广金账户扣款。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdSalesStarServiceImpl implements AdSalesStarService {

    /** 5 个餐段时段 */
    public static final List<String> MEAL_SLOTS = List.of("breakfast", "lunch", "afternoon", "dinner", "supper");

    /** 各时段开始小时: 早餐6/午餐10/下午茶13/晚餐17/宵夜21（到达开始时间后当天该时段不可售） */
    private static final Map<String, Integer> SLOT_START_HOURS = Map.of(
            "breakfast", 6, "lunch", 10, "afternoon", 13, "dinner", 17, "supper", 21);

    /** 加购锁定时长（秒）: 商家加购后锁定格子，其它商家看到已售罄，到期自动释放 */
    private static final long LOCK_SECONDS = 60L;

    private final AdAlgorithmMapper algorithmMapper;
    private final AdCellLockMapper lockMapper;
    private final AdOrderMapper orderMapper;
    private final AdOrderItemStarMapper itemMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final AdPricingStarService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdInventoryVO inventory(Long algoId, String storeCode, String groupCode) {
        AdAlgorithm algorithm = requireActiveAlgorithm(algoId);
        AdPricingStarVO pricing = requireActivePricing(algoId);
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }
        // 屏蔽商家拦截（规则6）
        requireNotBlocked(pricing, storeCode, groupCode);

        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        // 规则1: 仅预售期内可售；规则2: 仅遍历定价已配置商圈
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Map<String, Integer> occupied = occupiedCounts(today, endDate);
        Map<String, Set<String>> lockGroups = activeLockGroups(algoId, today, endDate);
        Set<String> sellSlots = parseSellSlots(pricing.getSellTimeSlots());

        AdInventoryVO vo = new AdInventoryVO();
        vo.setAlgoId(algoId);
        vo.setPresaleDays(pricing.getPresaleDays());
        vo.setDiscountTiers(pricing.getDiscountTiers());
        vo.setSlotDiscounts(pricing.getSlotDiscounts());
        for (AdPricingStarVO.RegionPriceItem regionPrice : pricing.getRegionPrices()) {
            BigDecimal cellPrice = round2(regionPrice.getDailyPrice()
                    .divide(BigDecimal.valueOf(MEAL_SLOTS.size()), RoundingMode.HALF_UP));
            int salesLimit = regionPrice.getDailySalesLimit() == null || regionPrice.getDailySalesLimit() < 1
                    ? 1 : regionPrice.getDailySalesLimit();
            for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
                for (String slot : MEAL_SLOTS) {
                    AdInventoryVO.Cell cell = new AdInventoryVO.Cell();
                    cell.setBizDate(date);
                    cell.setRegion(regionPrice.getRegion());
                    cell.setMealSlot(slot);
                    cell.setCellPrice(cellPrice);
                    cell.setSalesLimit(salesLimit);
                    String key = cellKey(date, regionPrice.getRegion(), slot);
                    int taken = takenCount(key, occupied, lockGroups, groupCode);
                    cell.setRemaining(Math.max(0, salesLimit - taken));
                    cell.setStatus(resolveCellStatus(date, slot, salesLimit, taken, sellSlots, today, now));
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

    /**
     * 格子状态判定:
     * 规则3 占用数(活跃订单)+其它商家锁数 达到库存 → 已售罄（退款后释放）;
     * 规则7 不在定价可售时段内 → 不可售;
     * 规则5 当天已过时段开始时间 → 不可售。
     */
    private String resolveCellStatus(LocalDate date, String slot, int salesLimit, int taken,
                                     Set<String> sellSlots, LocalDate today, LocalDateTime now) {
        if (taken >= salesLimit) {
            return "soldOut";
        }
        if (!sellSlots.contains(slot)) {
            return "unavailable";
        }
        Integer startHour = SLOT_START_HOURS.get(slot);
        if (date.isEqual(today) && startHour != null && now.getHour() >= startHour) {
            return "unavailable";
        }
        return "available";
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
        // 屏蔽商家拦截（规则6）
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());

        // 1. 推广金账户可用校验
        FinAccount account = accountService.requireUsable(request.getGroupCode(), brand);

        // 2. 格子去重 + 窗口/定价校验
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Set<String> sellSlots = parseSellSlots(pricing.getSellTimeSlots());
        Map<Integer, BigDecimal> regionDailyPrice = new LinkedHashMap<>();
        Map<Integer, Integer> regionSalesLimit = new LinkedHashMap<>();
        for (AdPricingStarVO.RegionPriceItem item : pricing.getRegionPrices()) {
            regionDailyPrice.put(item.getRegion(), item.getDailyPrice());
            regionSalesLimit.put(item.getRegion(), item.getDailySalesLimit() == null || item.getDailySalesLimit() < 1
                    ? 1 : item.getDailySalesLimit());
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
            // 规则7: 定价可售时段限制
            if (!sellSlots.contains(cell.getMealSlot())) {
                throw new BusinessException("該時段不在可售時段範圍內");
            }
            // 规则5: 当天已过时段开始时间不可购买
            Integer startHour = SLOT_START_HOURS.get(cell.getMealSlot());
            if (cell.getBizDate().isEqual(today) && startHour != null && now.getHour() >= startHour) {
                throw new BusinessException("該時段已開始，無法購買");
            }
            if (!requestKeys.add(cellKey(cell.getBizDate(), cell.getRegion(), cell.getMealSlot()))) {
                throw new BusinessException("選購格子重複");
            }
        }

        // 3. 库存校验（仅活跃订单占用格子）+ 规则4 其它商家加购锁校验
        Map<String, Integer> occupied = occupiedCounts(today, endDate);
        Map<String, Set<String>> lockGroups = activeLockGroups(request.getAlgoId(), today, endDate);
        for (String key : requestKeys) {
            int taken = takenCount(key, occupied, lockGroups, request.getGroupCode());
            int limit = salesLimitOfKey(key, regionSalesLimit);
            if (taken >= limit) {
                throw new BusinessException("部分格子已售罄，請刷新後重新選擇");
            }
        }

        // 4. 计价: 先时段折扣（全时段/单独时段），再按时段个数梯度折上折
        BigDecimal cellUnitDivisor = BigDecimal.valueOf(MEAL_SLOTS.size());
        Map<Integer, Map<String, Object>> slotDiscountByRegion = parseSlotDiscounts(pricing.getSlotDiscounts());
        // 同日期同商圈选购的餐段集合：集齐全部 5 段时适用全时段折扣
        Map<String, Set<String>> coveredSlotsByDateRegion = new LinkedHashMap<>();
        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            coveredSlotsByDateRegion
                    .computeIfAbsent(cell.getBizDate() + "|" + cell.getRegion(), k -> new HashSet<>())
                    .add(cell.getMealSlot());
        }
        BigDecimal originalTotal = BigDecimal.ZERO;
        BigDecimal slotDiscountedTotal = BigDecimal.ZERO;
        Map<String, BigDecimal> cellPriceMap = new LinkedHashMap<>();
        Map<String, BigDecimal> cellDiscountedMap = new LinkedHashMap<>();
        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            BigDecimal cellPrice = round2(regionDailyPrice.get(cell.getRegion())
                    .divide(cellUnitDivisor, RoundingMode.HALF_UP));
            String key = cellKey(cell.getBizDate(), cell.getRegion(), cell.getMealSlot());
            cellPriceMap.put(key, cellPrice);
            originalTotal = originalTotal.add(cellPrice);
            Set<String> covered = coveredSlotsByDateRegion.get(cell.getBizDate() + "|" + cell.getRegion());
            BigDecimal factor = slotDiscountFactor(
                    slotDiscountByRegion.get(cell.getRegion()), cell.getMealSlot(),
                    covered != null && covered.containsAll(MEAL_SLOTS));
            BigDecimal discounted = round2(cellPrice.multiply(factor)
                    .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
            cellDiscountedMap.put(key, discounted);
            slotDiscountedTotal = slotDiscountedTotal.add(discounted);
        }
        // 时段个数梯度折扣匹配总格子数，对时段折扣后的价格再打折（折上折）
        BigDecimal discountPercent = matchDiscountTier(pricing.getDiscountTiers(), request.getCells().size());
        BigDecimal actualTotal = round2(slotDiscountedTotal.multiply(discountPercent)
                .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);

        // 5. 余额校验
        BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
        if (balance.compareTo(actualTotal) < 0) {
            throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
        }

        // 6. 写订单主表 + 明细 + 财务扣款（非 BusinessException 一律转为友好提示，避免「系统繁忙」）
        try {
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
            // 明细实付 = 时段折扣后价格 x 梯度折扣（与总价同算法）
            BigDecimal salePrice = round2(cellDiscountedMap.get(key).multiply(discountPercent)
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

        // 7. 扣款 + 写消费明细（财务写入链: 按充值批次 FIFO 拆分挂批次号, 变动类别=广告类型）
        String changeType = AdAlgoTypeNames.of(algorithm.getAlgoType());
        String firstDetailId = finWriteChainService.writeAdConsume(
                request.getGroupCode(), order.getGroupName(), brand,
                order.getStoreCode(), order.getStoreName(), "外賣",
                actualTotal, changeType, request.getBdEmpId(),
                changeType + "廣告購買 訂單" + orderNo, orderNo, now);

        order.setFlowNo(firstDetailId);
        orderMapper.updateById(order);

        // 8. 下单成功后释放本商家对这些格子的加购锁（规则4）
        releaseLocks(request.getAlgoId(), request.getGroupCode(), request.getCells());
        return AdOrderVO.from(order);
        } catch (BusinessException e) {
            throw e;  // 业务异常直接抛出，由全局处理器处理
        } catch (DuplicateKeyException e) {
            log.warn("下单并发冲突(订单号重复): algoId={}, groupCode={}", request.getAlgoId(), request.getGroupCode());
            throw new BusinessException("訂單編號生成衝突，請稍後重試");
        } catch (Exception e) {
            log.error("广告下单异常: algoId={}, groupCode={}, storeCode={}, cells={}",
                    request.getAlgoId(), request.getGroupCode(), request.getStoreCode(),
                    request.getCells().size(), e);
            throw new BusinessException("下單失敗: " + e.getMessage());
        }
    }

    /* ==================== 加购锁定（规则4: 60秒） ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void lockCells(AdStarOrderRequest request) {
        requireActiveAlgorithm(request.getAlgoId());
        AdPricingStarVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getRegionPrices().isEmpty()) {
            throw new BusinessException("該算法未配置商圈計價");
        }
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());

        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Set<String> sellSlots = parseSellSlots(pricing.getSellTimeSlots());
        Set<Integer> configuredRegions = new HashSet<>();
        Map<Integer, Integer> regionSalesLimit = new LinkedHashMap<>();
        for (AdPricingStarVO.RegionPriceItem item : pricing.getRegionPrices()) {
            configuredRegions.add(item.getRegion());
            regionSalesLimit.put(item.getRegion(), item.getDailySalesLimit() == null || item.getDailySalesLimit() < 1
                    ? 1 : item.getDailySalesLimit());
        }
        Map<String, Integer> occupied = occupiedCounts(today, endDate);
        Map<String, Set<String>> lockGroups = activeLockGroups(request.getAlgoId(), today, endDate);

        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || cell.getRegion() == null || !StringUtils.hasText(cell.getMealSlot())) {
                throw new BusinessException("格子信息不完整");
            }
            if (!MEAL_SLOTS.contains(cell.getMealSlot())) {
                throw new BusinessException("非法的餐段時段: " + cell.getMealSlot());
            }
            if (cell.getBizDate().isBefore(today) || cell.getBizDate().isAfter(endDate)) {
                throw new BusinessException("鎖定日期超出預售窗口");
            }
            if (!configuredRegions.contains(cell.getRegion())) {
                throw new BusinessException("商圈未配置計價");
            }
            if (!sellSlots.contains(cell.getMealSlot())) {
                throw new BusinessException("該時段不在可售時段範圍內");
            }
            Integer startHour = SLOT_START_HOURS.get(cell.getMealSlot());
            if (cell.getBizDate().isEqual(today) && startHour != null && now.getHour() >= startHour) {
                throw new BusinessException("該時段已開始，無法加購");
            }
            String key = cellKey(cell.getBizDate(), cell.getRegion(), cell.getMealSlot());
            int taken = takenCount(key, occupied, lockGroups, request.getGroupCode());
            int limit = salesLimitOfKey(key, regionSalesLimit);
            if (taken >= limit) {
                throw new BusinessException("該時段已售罄");
            }
        }

        LocalDateTime expireAt = now.plusSeconds(LOCK_SECONDS);
        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            // 先清理该格子的过期锁与本人旧锁，再写入新锁（续期）
            lockMapper.delete(new LambdaQueryWrapper<AdCellLock>()
                    .eq(AdCellLock::getAlgoId, request.getAlgoId())
                    .eq(AdCellLock::getBizDate, cell.getBizDate())
                    .eq(AdCellLock::getRegion, cell.getRegion())
                    .eq(AdCellLock::getMealSlot, cell.getMealSlot())
                    .and(w -> w.le(AdCellLock::getExpireAt, now)
                            .or().eq(AdCellLock::getGroupCode, request.getGroupCode())));
            AdCellLock lock = new AdCellLock();
            lock.setAlgoId(request.getAlgoId());
            lock.setBizDate(cell.getBizDate());
            lock.setRegion(cell.getRegion());
            lock.setMealSlot(cell.getMealSlot());
            lock.setGroupCode(request.getGroupCode());
            lock.setStoreCode(request.getStoreCode());
            lock.setExpireAt(expireAt);
            try {
                lockMapper.insert(lock);
            } catch (DuplicateKeyException e) {
                throw new BusinessException("該時段已被其他商家加購鎖定，請稍後再試");
            }
        }
    }

    @Override
    public void unlockCells(AdStarOrderRequest request) {
        for (AdStarOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || cell.getRegion() == null || !StringUtils.hasText(cell.getMealSlot())) {
                continue;
            }
            lockMapper.delete(new LambdaQueryWrapper<AdCellLock>()
                    .eq(AdCellLock::getAlgoId, request.getAlgoId())
                    .eq(AdCellLock::getGroupCode, request.getGroupCode())
                    .eq(AdCellLock::getBizDate, cell.getBizDate())
                    .eq(AdCellLock::getRegion, cell.getRegion())
                    .eq(AdCellLock::getMealSlot, cell.getMealSlot()));
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

    private AdPricingStarVO requireActivePricing(Long algoId) {
        AdPricingStarVO pricing = pricingService.activeByAlgo(algoId);
        if (pricing == null) {
            throw new BusinessException("該算法未配置銷售定價");
        }
        return pricing;
    }

    /** 预售窗口内被活跃订单（未退款）占用的格子计数: 格子键 → 占用个数 */
    private Map<String, Integer> occupiedCounts(LocalDate start, LocalDate end) {
        List<AdOrderItemStar> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemStar>()
                        .ge(AdOrderItemStar::getBizDate, start)
                        .le(AdOrderItemStar::getBizDate, end)
                        .in(AdOrderItemStar::getDeliveryStatus, 1, 2));
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (AdOrderItemStar item : items) {
            counts.merge(cellKey(item.getBizDate(), item.getRegion(), item.getMealSlot()), 1, Integer::sum);
        }
        return counts;
    }

    /** 预售窗口内未过期的加购锁: 格子键 → 持锁集团集合（同集团唯一键仅一条） */
    private Map<String, Set<String>> activeLockGroups(Long algoId, LocalDate start, LocalDate end) {
        List<AdCellLock> locks = lockMapper.selectList(
                new LambdaQueryWrapper<AdCellLock>()
                        .eq(AdCellLock::getAlgoId, algoId)
                        .ge(AdCellLock::getBizDate, start)
                        .le(AdCellLock::getBizDate, end)
                        .gt(AdCellLock::getExpireAt, LocalDateTime.now()));
        Map<String, Set<String>> map = new LinkedHashMap<>();
        for (AdCellLock lock : locks) {
            map.computeIfAbsent(cellKey(lock.getBizDate(), lock.getRegion(), lock.getMealSlot()),
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

    /** 从格子键(日期|商圈|餐段)提取商圈并取库存上限 */
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

    /** 下单成功后释放本商家的加购锁 */
    private void releaseLocks(Long algoId, String groupCode, List<AdStarOrderRequest.CellSelection> cells) {
        for (AdStarOrderRequest.CellSelection cell : cells) {
            lockMapper.delete(new LambdaQueryWrapper<AdCellLock>()
                    .eq(AdCellLock::getAlgoId, algoId)
                    .eq(AdCellLock::getGroupCode, groupCode)
                    .eq(AdCellLock::getBizDate, cell.getBizDate())
                    .eq(AdCellLock::getRegion, cell.getRegion())
                    .eq(AdCellLock::getMealSlot, cell.getMealSlot()));
        }
    }

    /** 屏蔽商家校验: 开关启用且命中屏蔽名单时禁止购买（规则6） */
    private void requireNotBlocked(AdPricingStarVO pricing, String storeCode, String groupCode) {
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

    /** 解析可售时段: 空或含 fullDay 表示全部时段（规则7） */
    private static Set<String> parseSellSlots(String sellTimeSlotsJson) {
        List<String> slots = JsonUtils.parseStringList(sellTimeSlotsJson);
        if (slots.isEmpty() || slots.contains("fullDay")) {
            return new HashSet<>(MEAL_SLOTS);
        }
        return new HashSet<>(slots);
    }

    /** 解析分商圈时段折扣配置: 商圈 → 折扣条目 */
    private static Map<Integer, Map<String, Object>> parseSlotDiscounts(String slotDiscountsJson) {
        Map<Integer, Map<String, Object>> map = new LinkedHashMap<>();
        for (Map<String, Object> entry : JsonUtils.parseMapList(slotDiscountsJson)) {
            Object region = entry.get("region");
            if (region instanceof Number number) {
                map.put(number.intValue(), entry);
            }
        }
        return map;
    }

    /**
     * 时段折扣因子（百分比）:
     * 集齐当天全部 5 个时段 → 全时段折扣; 否则 → 单独时段折扣; 未配置返回 100（不打折）
     */
    private static BigDecimal slotDiscountFactor(Map<String, Object> entry, String slot, boolean fullDayCovered) {
        if (entry == null) {
            return BigDecimal.valueOf(100);
        }
        String key = fullDayCovered ? "fullDay" : slot;
        BigDecimal factor = decimalOf(entry, key);
        if (factor == null || factor.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.valueOf(100);
        }
        return factor;
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

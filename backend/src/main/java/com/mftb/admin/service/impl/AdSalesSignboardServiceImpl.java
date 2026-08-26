package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingSignboardVO;
import com.mftb.admin.dto.AdSignboardInventoryVO;
import com.mftb.admin.dto.AdSignboardOrderRequest;
import com.mftb.admin.dto.StoreDataConfigDTO;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemSignboard;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.BizStoreDataConfig;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemSignboardMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreDataConfigMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdPricingSignboardService;
import com.mftb.admin.service.AdSalesSignboardService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.service.StoreDataConfigService;
import com.mftb.admin.util.AdCalcUtils;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 金字招牌广告销售服务实现（库存查询 + 下单扣款）
 * <p>
 * 售卖单位: 标签 x 日期（无商圈/餐段维度），不限库存，多商家可同时购买同一格子，
 * 但同一商家(集团)已购买的「标签x日期」不能重复购买（退款释放后可再购）。
 * 每个标签独立计价，梯度折扣按该标签购买天数匹配，实付从推广金账户扣款。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdSalesSignboardServiceImpl implements AdSalesSignboardService {

    /** 赠送管理中金字招牌的广告类型标识（biz_gift_record.ad_type） */
    public static final String GIFT_AD_TYPE = "golden_signboard";

    private final AdOrderMapper orderMapper;
    private final AdOrderItemSignboardMapper itemMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final BizStoreDataConfigMapper storeDataConfigMapper;
    private final AdPricingSignboardService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final GiftService giftService;
    private final StoreDataConfigService storeDataConfigService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdSignboardInventoryVO inventory(Long algoId, String storeCode, String groupCode) {
        AdPricingSignboardVO pricing = requireActivePricing(algoId);
        if (pricing.getSignboardItems().isEmpty()) {
            throw new BusinessException("該算法未配置標籤計價");
        }

        LocalDate today = LocalDate.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        // 订单主表 algoId 存的是定价配置ID，此处必须用 pricing.getId() 匹配已购格子
        Set<String> purchased = purchasedCells(pricing.getId(), groupCode, today, endDate);

        AdSignboardInventoryVO vo = new AdSignboardInventoryVO();
        vo.setAlgoId(algoId);
        vo.setPresaleDays(pricing.getPresaleDays());
        vo.setRefundEnabled(pricing.getRefundEnabled());
        vo.setCancelFeeTiers(pricing.getCancelFeeTiers());

        // 加载算法配置中的场景资格条件 + 构建当前门店的资格评估上下文
        Map<String, Map<String, ScenarioCondition>> algoConditions = loadAlgoConditions(pricing.getAlgoId());
        EvalContext evalCtx = buildEvalContext(pricing.getBrand(), pricing.getChannel(), storeCode);

        // 标签计价信息（含场景 + 资格条件 + 实际评估结果）
        for (AdPricingSignboardVO.LabelPriceItem label : pricing.getSignboardItems()) {
            AdSignboardInventoryVO.LabelPrice lp = new AdSignboardInventoryVO.LabelPrice();
            lp.setLabelType(label.getLabelType());
            lp.setScenario(label.getScenario());
            lp.setEnabled(label.getEnabled());
            lp.setPricePerDay(label.getPrice());
            lp.setDiscountTiers(label.getDiscountTiers());
            // 填充资格条件信息（按当前门店数据实时评估）
            fillQualificationInfo(lp, algoConditions, evalCtx);
            vo.getLabels().add(lp);
        }

        // 生成格子: 仅展示已启用标签（每个标签x场景 独立一格）
        List<AdPricingSignboardVO.LabelPriceItem> enabledLabels = pricing.getSignboardItems().stream()
                .filter(l -> Boolean.TRUE.equals(l.getEnabled()))
                .toList();
        for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
            for (AdPricingSignboardVO.LabelPriceItem label : enabledLabels) {
                AdSignboardInventoryVO.Cell cell = new AdSignboardInventoryVO.Cell();
                cell.setBizDate(date);
                cell.setLabelType(label.getLabelType());
                cell.setScenario(label.getScenario());
                cell.setPricePerDay(label.getPrice());
                boolean bought = StringUtils.hasText(groupCode)
                        && purchased.contains(cellKey(date, label.getLabelType(), label.getScenario()));
                cell.setStatus(bought ? "purchased" : "available");
                vo.getCells().add(cell);
            }
        }
        vo.getCells().sort(Comparator.comparing(AdSignboardInventoryVO.Cell::getBizDate)
                .thenComparing(AdSignboardInventoryVO.Cell::getLabelType)
                .thenComparing(AdSignboardInventoryVO.Cell::getScenario, Comparator.nullsLast(Comparator.naturalOrder())));
        return vo;
    }

    /* ==================== 下单扣款 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdSignboardOrderRequest request) {
        AdPricingSignboardVO pricing = requireActivePricing(request.getAlgoId());
        if (pricing.getSignboardItems().isEmpty()) {
            throw new BusinessException("該算法未配置標籤計價");
        }
        String brand = pricing.getBrand();
        Integer channel = pricing.getChannel();

        // 1. 构建标签价格映射（key = labelType:scenario，全局模式下所有标签共用主表全局折扣）
        boolean isGlobalDiscount = "global".equals(pricing.getDiscountMode());
        String globalTiersJson = pricing.getGlobalDiscountTiers();
        Map<String, BigDecimal> labelPriceMap = new LinkedHashMap<>();
        Map<String, String> labelDiscountTiersMap = new LinkedHashMap<>();
        for (AdPricingSignboardVO.LabelPriceItem label : pricing.getSignboardItems()) {
            if (Boolean.TRUE.equals(label.getEnabled())) {
                String key = labelKey(label.getLabelType(), label.getScenario());
                labelPriceMap.put(key, label.getPrice());
                labelDiscountTiersMap.put(key,
                        isGlobalDiscount ? globalTiersJson : label.getDiscountTiers());
            }
        }

        // 2. 格子去重 + 定价校验
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        Set<String> requestKeys = new HashSet<>();
        for (AdSignboardOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null || !StringUtils.hasText(cell.getLabelType())) {
                throw new BusinessException("格子信息不完整");
            }
            if (cell.getBizDate().isBefore(today) || cell.getBizDate().isAfter(endDate)) {
                throw new BusinessException("購買日期超出預售窗口(" + today + " ~ " + endDate + ")");
            }
            String pk = labelKey(cell.getLabelType(), cell.getScenario());
            if (!labelPriceMap.containsKey(pk)) {
                throw new BusinessException("標籤未啟用或未配置計價: " + cell.getLabelType()
                        + (cell.getScenario() != null ? "(" + cell.getScenario() + ")" : ""));
            }
            if (!requestKeys.add(cellKey(cell.getBizDate(), cell.getLabelType(), cell.getScenario()))) {
                throw new BusinessException("選購格子重複（同一標籤同一場景同一日期只能購買一次）");
            }
        }

        // 3. 重复购买校验（订单主表 algoId 存的是定价配置ID，必须用 pricing.getId() 匹配）
        Set<String> purchased = purchasedCells(pricing.getId(), request.getGroupCode(), today, endDate);
        for (String key : requestKeys) {
            if (purchased.contains(key)) {
                throw new BusinessException("該標籤在所选日期已購買，不能重複購買");
            }
        }

        // 3.5 对比类标签资格校验 + 同一天同一标签场景互斥校验
        BizStore store = StringUtils.hasText(request.getStoreCode())
                ? storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                        .eq(BizStore::getStoreCode, request.getStoreCode())
                        .last("LIMIT 1"))
                : null;
        validateComparisonCells(pricing, request, store, purchased);

        // 4. 计价: 按标签x场景分别计算原价 → 按该组合天数匹配梯度折扣
        BigDecimal originalTotal = BigDecimal.ZERO;
        Map<String, BigDecimal> cellPriceMap = new LinkedHashMap<>();
        // 按标签x场景分组统计天数
        Map<String, Long> labelDayCount = new LinkedHashMap<>();
        for (AdSignboardOrderRequest.CellSelection cell : request.getCells()) {
            String lk = labelKey(cell.getLabelType(), cell.getScenario());
            labelDayCount.merge(lk, 1L, Long::sum);
        }
        // 按标签x场景计算折扣
        Map<String, BigDecimal> labelDiscountPercent = new LinkedHashMap<>();
        for (Map.Entry<String, Long> entry : labelDayCount.entrySet()) {
            String lk = entry.getKey();
            long days = entry.getValue();
            String tiersJson = labelDiscountTiersMap.get(lk);
            labelDiscountPercent.put(lk, AdCalcUtils.matchDiscountTier(tiersJson, "minDays", (int) days));
        }
        // 逐格计价
        BigDecimal discountedTotal = BigDecimal.ZERO;
        for (AdSignboardOrderRequest.CellSelection cell : request.getCells()) {
            String pk = labelKey(cell.getLabelType(), cell.getScenario());
            BigDecimal price = AdCalcUtils.round2(labelPriceMap.get(pk));
            String key = cellKey(cell.getBizDate(), cell.getLabelType(), cell.getScenario());
            cellPriceMap.put(key, price);
            originalTotal = originalTotal.add(price);
            // 折后价 = 原价 × 折扣百分比 / 100
            BigDecimal dp = labelDiscountPercent.get(pk);
            discountedTotal = discountedTotal.add(
                    AdCalcUtils.round2(price.multiply(dp).divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP)));
        }

        // 5. 赠送天数抵扣
        int giftDays = request.getGiftDays() == null ? 0 : request.getGiftDays();
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

        // 6. 推广金账户校验 + 余额校验
        if (actualTotal.signum() > 0) {
            FinAccount account = accountService.requireUsable(request.getGroupCode(), brand);
            BigDecimal balance = account.getVirtualBalance() == null ? BigDecimal.ZERO : account.getVirtualBalance();
            if (balance.compareTo(actualTotal) < 0) {
                throw new BusinessException("推廣金餘額不足，當前餘額 " + balance + "，需支付 " + actualTotal);
            }
        }

        // 7. 写订单主表
        String orderNo = bizSeqService.next(BizSeqService.RULE_AD_ORDER_SIGNBOARD);
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, request.getGroupCode())
                        .last("LIMIT 1"));

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(13); // 金字招牌固定类型
        order.setAlgoId(pricing.getId()); // 存定价配置ID
        order.setAlgoName(pricing.getAlgoName());
        order.setAlgoCode(pricing.getPricingNo());
        order.setBrand(brand);
        order.setChannel(channel);
        order.setGroupCode(request.getGroupCode());
        order.setGroupName(group != null ? group.getGroupName() : request.getGroupCode());
        order.setStoreCode(store != null ? store.getStoreCode() : request.getStoreCode());
        order.setStoreName(store != null ? store.getStoreName() : null);
        order.setBdEmpId(request.getBdEmpId());
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
        order.setStatus(1); // 待推广
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        // 8. 写明细: 按标签折扣后价等比分摊
        BigDecimal allocated = BigDecimal.ZERO;
        List<AdSignboardOrderRequest.CellSelection> cells = request.getCells();
        for (int i = 0; i < cells.size(); i++) {
            AdSignboardOrderRequest.CellSelection cell = cells.get(i);
            String key = cellKey(cell.getBizDate(), cell.getLabelType(), cell.getScenario());
            BigDecimal cellOrigPrice = cellPriceMap.get(key);
            String lk = labelKey(cell.getLabelType(), cell.getScenario());
            BigDecimal dp = labelDiscountPercent.get(lk);
            BigDecimal cellDiscounted = AdCalcUtils.round2(cellOrigPrice.multiply(dp)
                    .divide(BigDecimal.valueOf(100), RoundingMode.HALF_UP));
            BigDecimal salePrice;
            if (i == cells.size() - 1) {
                salePrice = actualTotal.subtract(allocated);
            } else {
                salePrice = discountedTotal.signum() == 0 ? BigDecimal.ZERO
                        : AdCalcUtils.round2(cellDiscounted
                                .multiply(actualTotal)
                                .divide(discountedTotal, RoundingMode.HALF_UP));
                allocated = allocated.add(salePrice);
            }
            AdOrderItemSignboard item = new AdOrderItemSignboard();
            item.setOrderId(order.getId());
            item.setOrderNo(orderNo);
            item.setBizDate(cell.getBizDate());
            item.setLabelType(cell.getLabelType());
            item.setScenario(cell.getScenario());
            item.setOriginalPrice(cellOrigPrice);
            item.setSalePrice(salePrice);
            item.setRefundPrice(BigDecimal.ZERO);
            item.setDeliveryStatus(1);
            item.setDeleted(0);
            itemMapper.insert(item);
        }

        // 9. 扣减赠送天数
        if (giftDays > 0 && store != null) {
            giftService.deductForOrder(store.getId(), GIFT_AD_TYPE, giftDays, orderNo,
                    pricing.getPricingNo(), pricing.getAlgoName());
        }

        // 10. 扣款 + 写消费明细
        String changeType = "金字招牌";
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

    private AdPricingSignboardVO requireActivePricing(Long algoId) {
        // activeByAlgo 按 algo_id 字段查找已啟用的定價配置（與 DayPicker/Revive 保持一致）
        AdPricingSignboardVO pricing = pricingService.activeByAlgo(algoId);
        if (pricing == null) {
            throw new BusinessException("該算法未配置銷售定價或定價未啟用");
        }
        return pricing;
    }

    /** 预售窗口内该商家(集团)已购买的活跃格子集合: 日期|标签|场景 */
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
        List<AdOrderItemSignboard> items = itemMapper.selectList(
                new LambdaQueryWrapper<AdOrderItemSignboard>()
                        .in(AdOrderItemSignboard::getOrderId, orderIds)
                        .ge(AdOrderItemSignboard::getBizDate, start)
                        .le(AdOrderItemSignboard::getBizDate, end)
                        .in(AdOrderItemSignboard::getDeliveryStatus, 1, 2));
        for (AdOrderItemSignboard item : items) {
            purchased.add(cellKey(item.getBizDate(), item.getLabelType(), item.getScenario()));
        }
        return purchased;
    }

    /** 格子唯一键: 日期|标签|场景 */
    private static String cellKey(LocalDate date, String labelType, String scenario) {
        return date + "|" + labelType + "|" + (scenario != null ? scenario : "");
    }

    /** 标签计价key: labelType:scenario */
    private static String labelKey(String labelType, String scenario) {
        return labelType + ":" + (scenario != null ? scenario : "");
    }

    /* ==================== 资格条件解析与评估 ==================== */

    /** 单条资格条件 */
    private static class Condition {
        String metric;
        String comparison;
        double value;
        /** 与下一条条件的关系: and/or */
        String nextOperator;
    }

    /** 场景资格条件（从算法配置解析） */
    private static class ScenarioCondition {
        String conditionDesc;
        final List<Condition> conditions = new ArrayList<>();
    }

    /** 资格评估结果 */
    private static class QualificationResult {
        boolean qualified;
        /** 本门店实际情况描述（排名/数值），供前端弹窗展示 */
        String actualDesc;
    }

    /** 评估上下文: 当前门店数据 + 按品牌/频道过滤后的对比组 */
    private static class EvalContext {
        BizStoreDataConfig current;
        final List<BizStoreDataConfig> allMacauGroup = new ArrayList<>();
        final List<BizStoreDataConfig> districtGroup = new ArrayList<>();
        boolean storeMissing = false;
        boolean regionMissing = false;
    }

    /**
     * 从算法配置中加载各标签x场景的资格条件
     * @return Map<labelType, Map<scenarioKey, ScenarioCondition>>
     *         scenarioKey: allMacau / district
     */
    private Map<String, Map<String, ScenarioCondition>> loadAlgoConditions(Long algoId) {
        Map<String, Map<String, ScenarioCondition>> result = new LinkedHashMap<>();
        AdAlgorithm algo = algorithmMapper.selectById(algoId);
        if (algo == null || !StringUtils.hasText(algo.getParams())) {
            return result;
        }
        try {
            Map<String, Object> params = JsonUtils.parseMap(algo.getParams());
            Object itemsObj = params.get("signboardItems");
            if (!(itemsObj instanceof List<?> itemsList)) return result;
            for (Object itemObj : itemsList) {
                if (!(itemObj instanceof Map<?, ?> item)) continue;
                String labelType = String.valueOf(item.get("labelType"));
                Object scenariosObj = item.get("scenarios");
                if (!(scenariosObj instanceof Map<?, ?> scenarios)) continue;
                Map<String, ScenarioCondition> labelConditions = new LinkedHashMap<>();
                for (String scenarioKey : List.of("allMacau", "district")) {
                    Object scObj = scenarios.get(scenarioKey);
                    if (!(scObj instanceof Map<?, ?> scMap)) continue;
                    ScenarioCondition sc = new ScenarioCondition();
                    sc.conditionDesc = buildConditionDesc(scMap);
                    Object condsObj = scMap.get("conditions");
                    if (condsObj instanceof List<?> conds) {
                        for (Object cObj : conds) {
                            if (!(cObj instanceof Map<?, ?> cMap)) continue;
                            Condition c = new Condition();
                            c.metric = cMap.get("qualificationMetric") != null
                                    ? String.valueOf(cMap.get("qualificationMetric")) : "";
                            c.comparison = cMap.get("qualificationComparison") != null
                                    ? String.valueOf(cMap.get("qualificationComparison")) : "ranking";
                            c.value = parseDouble(cMap.get("qualificationValue"));
                            c.nextOperator = "or".equals(String.valueOf(cMap.get("nextOperator"))) ? "or" : "and";
                            sc.conditions.add(c);
                        }
                    }
                    labelConditions.put(scenarioKey, sc);
                }
                result.put(labelType, labelConditions);
            }
        } catch (Exception e) {
            // 解析失败不影响主流程
            log.warn("招牌算法场景条件解析失败: algoId={}, msg={}", algo != null ? algo.getId() : null, e.getMessage());
        }
        return result;
    }

    private static double parseDouble(Object obj) {
        if (obj == null) return 0;
        try {
            return Double.parseDouble(String.valueOf(obj));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * 构建资格评估上下文: 加载当前门店数据配置，并按定价的品牌+业务频道过滤对比组
     * （全澳 = 所有匹配门店；商圈 = 与当前门店 region 相同的匹配门店）
     */
    private EvalContext buildEvalContext(String brand, Integer channel, String storeCode) {
        EvalContext ctx = new EvalContext();
        if (!StringUtils.hasText(storeCode)) {
            ctx.storeMissing = true;
            return ctx;
        }
        BizStore store = storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                .eq(BizStore::getStoreCode, storeCode).last("LIMIT 1"));
        if (store == null) {
            ctx.storeMissing = true;
            return ctx;
        }
        if (store.getRegion() == null) {
            ctx.regionMissing = true;
        }
        // 当前门店无配置时自动预生成（按 storeId 种子确定性随机）
        ctx.current = storeDataConfigMapper.selectOne(new LambdaQueryWrapper<BizStoreDataConfig>()
                .eq(BizStoreDataConfig::getStoreId, store.getId()));
        if (ctx.current == null) {
            StoreDataConfigDTO generated = storeDataConfigService.getConfig(store.getId());
            ctx.current = new BizStoreDataConfig();
            ctx.current.setStoreId(store.getId());
            ctx.current.setMonthlyOrders(generated.getMonthlyOrders());
            ctx.current.setMonthlyRepurchaseOrders(generated.getMonthlyRepurchaseOrders());
            ctx.current.setMonthlyPositiveOrders(generated.getMonthlyPositiveOrders());
            ctx.current.setMonthlyVisits(generated.getMonthlyVisits());
            ctx.current.setStoreFavorites(generated.getStoreFavorites());
            ctx.current.setMonthlyCustomers(generated.getMonthlyCustomers());
        }
        // 对比组: 品牌+频道匹配且已配置数据的有效门店
        Map<Long, BizStoreDataConfig> cfgByStoreId = storeDataConfigMapper.selectList(null).stream()
                .collect(Collectors.toMap(BizStoreDataConfig::getStoreId, c -> c, (a, b) -> a));
        List<BizStore> stores = storeMapper.selectList(null);
        for (BizStore s : stores) {
            if (!matchesBrandChannel(s, brand, channel)) continue;
            BizStoreDataConfig c = cfgByStoreId.get(s.getId());
            if (c == null) continue;
            ctx.allMacauGroup.add(c);
            if (store.getRegion() != null && store.getRegion().equals(s.getRegion())) {
                ctx.districtGroup.add(c);
            }
        }
        // 确保当前门店参与排名（品牌/频道不匹配或配置刚生成时补入）
        if (ctx.allMacauGroup.stream().noneMatch(c -> c.getStoreId().equals(store.getId()))) {
            ctx.allMacauGroup.add(ctx.current);
        }
        if (store.getRegion() != null
                && ctx.districtGroup.stream().noneMatch(c -> c.getStoreId().equals(store.getId()))) {
            ctx.districtGroup.add(ctx.current);
        }
        return ctx;
    }

    /** 门店是否属于定价适用的品牌+业务频道（门店两字段均为逗号分隔多值） */
    private static boolean matchesBrandChannel(BizStore store, String brand, Integer channel) {
        if (StringUtils.hasText(brand)) {
            if (!StringUtils.hasText(store.getBrand())
                    || !List.of(store.getBrand().split(",")).contains(brand)) {
                return false;
            }
        }
        if (channel != null) {
            if (!StringUtils.hasText(store.getBizChannel())
                    || !List.of(store.getBizChannel().split(",")).contains(String.valueOf(channel))) {
                return false;
            }
        }
        return true;
    }

    /**
     * 评估当前门店是否满足场景条件（排名基于门店数据配置，与标签购买情况无关）
     * <p>
     * ranking: 对比组内排名 ≤ 值；percentage: 排名占比 ≤ 值%（前 X% 的商家）；absolute: 指标值 ≥ 值。
     * 多条条件按 nextOperator 以 and/or 左折叠组合。
     */
    private static QualificationResult evaluate(String scenarioKey, ScenarioCondition sc, EvalContext ctx) {
        QualificationResult r = new QualificationResult();
        if (ctx.storeMissing) {
            // 未选门店时展示阶段不拦截，下单时强制校验
            r.qualified = true;
            return r;
        }
        if ("district".equals(scenarioKey) && ctx.regionMissing) {
            r.qualified = false;
            r.actualDesc = "門店未設置所屬商圈，無法參與商圈對比";
            return r;
        }
        List<BizStoreDataConfig> group = "district".equals(scenarioKey) ? ctx.districtGroup : ctx.allMacauGroup;
        String scopeLabel = "district".equals(scenarioKey) ? "商圈內" : "全澳";
        Boolean overall = null;
        StringBuilder actual = new StringBuilder();
        for (int i = 0; i < sc.conditions.size(); i++) {
            Condition c = sc.conditions.get(i);
            if (i > 0) {
                actual.append("or".equals(sc.conditions.get(i - 1).nextOperator) ? " 或 " : " 且 ");
            }
            int currentValue = metricValue(c.metric, ctx.current);
            // 竞争排名: 并列同名次（1 + 严格大于本门店的商家数）
            int rank = 1;
            for (BizStoreDataConfig g : group) {
                if (metricValue(c.metric, g) > currentValue) rank++;
            }
            boolean pass;
            switch (c.comparison) {
                case "percentage" -> {
                    pass = group.isEmpty() || rank * 100.0 <= c.value * group.size();
                    actual.append(scopeLabel).append(metricLabel(c.metric))
                            .append("前 ").append((int) c.value).append("%，本門店：第 ")
                            .append(rank).append("/").append(group.size()).append(" 名");
                }
                case "absolute" -> {
                    pass = currentValue >= (int) c.value;
                    actual.append(scopeLabel).append(metricLabel(c.metric))
                            .append(" ≥ ").append((int) c.value).append("，本門店：").append(currentValue);
                }
                default -> {
                    pass = rank <= (int) c.value;
                    actual.append(scopeLabel).append(metricLabel(c.metric))
                            .append("前 ").append((int) c.value).append(" 名，本門店：第 ")
                            .append(rank).append(" 名");
                }
            }
            actual.append(pass ? " ✔" : " ✘");
            if (overall == null) {
                overall = pass;
            } else if ("or".equals(sc.conditions.get(i - 1).nextOperator)) {
                overall = overall || pass;
            } else {
                overall = overall && pass;
            }
        }
        r.qualified = overall == null || overall;
        r.actualDesc = actual.toString();
        return r;
    }

    /** 指标值映射: 算法配置指标 → 门店数据配置字段 */
    private static int metricValue(String metric, BizStoreDataConfig c) {
        if (c == null) return 0;
        return switch (metric) {
            case "monthlyOrders" -> nz(c.getMonthlyOrders());
            case "monthlyRepurchase" -> nz(c.getMonthlyRepurchaseOrders());
            case "monthlyRating" -> nz(c.getMonthlyPositiveOrders());
            case "monthlyVisits" -> nz(c.getMonthlyVisits());
            case "storeFavorites", "favoritesCount" -> nz(c.getStoreFavorites());
            case "monthlyCustomers", "customerCount" -> nz(c.getMonthlyCustomers());
            default -> 0;
        };
    }

    private static int nz(Integer v) {
        return v == null ? 0 : v;
    }

    /** 下单时校验对比类标签: 资格 + 同一天同一标签仅能展示一种场景（订单内互斥 + 与已购互斥） */
    private void validateComparisonCells(AdPricingSignboardVO pricing, AdSignboardOrderRequest request,
                                         BizStore store, Set<String> purchased) {
        List<AdSignboardOrderRequest.CellSelection> comparisonCells = request.getCells().stream()
                .filter(c -> StringUtils.hasText(c.getScenario())).toList();
        if (comparisonCells.isEmpty()) {
            return;
        }
        if (store == null) {
            throw new BusinessException("請選擇門店後再購買對比類標籤");
        }
        Map<String, Map<String, ScenarioCondition>> algoConditions = loadAlgoConditions(pricing.getAlgoId());
        EvalContext ctx = buildEvalContext(pricing.getBrand(), pricing.getChannel(), request.getStoreCode());
        for (AdSignboardOrderRequest.CellSelection cell : comparisonCells) {
            String scenarioKey = "all_macau".equals(cell.getScenario()) ? "allMacau" : "district";
            Map<String, ScenarioCondition> labelConds = algoConditions.get(cell.getLabelType());
            ScenarioCondition sc = labelConds != null ? labelConds.get(scenarioKey) : null;
            if (sc == null || sc.conditions.isEmpty()) {
                continue;
            }
            QualificationResult r = evaluate(scenarioKey, sc, ctx);
            if (!r.qualified) {
                throw new BusinessException("門店不滿足 " + cell.getLabelType() + " 標籤（"
                        + ("all_macau".equals(cell.getScenario()) ? "全澳對比" : "商圈對比") + "）購買條件："
                        + (r.actualDesc != null ? r.actualDesc : "資格不符"));
            }
        }
        // 同一天同一标签只能展示一种场景
        Map<String, Set<LocalDate>> orderDates = new LinkedHashMap<>();
        for (AdSignboardOrderRequest.CellSelection cell : comparisonCells) {
            orderDates.computeIfAbsent(labelKey(cell.getLabelType(), cell.getScenario()), k -> new HashSet<>())
                    .add(cell.getBizDate());
        }
        for (AdSignboardOrderRequest.CellSelection cell : comparisonCells) {
            String otherScenario = "all_macau".equals(cell.getScenario()) ? "district" : "all_macau";
            String otherLabel = "all_macau".equals(otherScenario) ? "全澳對比" : "商圈對比";
            Set<LocalDate> otherOrderDates = orderDates.getOrDefault(
                    labelKey(cell.getLabelType(), otherScenario), Set.of());
            if (otherOrderDates.contains(cell.getBizDate())) {
                throw new BusinessException(cell.getBizDate() + " 的 " + cell.getLabelType()
                        + " 標籤同時選擇了兩種場景，同一天同一標籤只能展示一種場景");
            }
            if (purchased.contains(cellKey(cell.getBizDate(), cell.getLabelType(), otherScenario))) {
                throw new BusinessException(cell.getBizDate() + " 的 " + cell.getLabelType() + " 標籤已購買"
                        + otherLabel + "場景，同一天同一標籤只能展示一種場景");
            }
        }
    }

    /** 构建单个场景的条件描述文本 */
    private static String buildConditionDesc(Map<?, ?> scenarioMap) {
        Object conditionsObj = scenarioMap.get("conditions");
        if (!(conditionsObj instanceof List<?> conditions) || conditions.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < conditions.size(); i++) {
            if (!(conditions.get(i) instanceof Map<?, ?> cond)) continue;
            if (i > 0) {
                Object opObj = cond.get("nextOperator");
                String op = opObj != null ? String.valueOf(opObj) : "and";
                sb.append(" ").append("and".equals(op) ? "且" : "或").append(" ");
            }
            Object metricObj = cond.get("qualificationMetric");
            String metric = metricObj != null ? String.valueOf(metricObj) : "";
            Object scopeObj = cond.get("qualificationScope");
            String scope = scopeObj != null ? String.valueOf(scopeObj) : "allMerchants";
            Object compObj = cond.get("qualificationComparison");
            String comparison = compObj != null ? String.valueOf(compObj) : "";
            Object valueObj = cond.get("qualificationValue");
            String value = valueObj != null ? String.valueOf(valueObj) : "";
            String scopeLabel = "districtMerchants".equals(scope) ? "商圈內" : "全澳";
            sb.append(scopeLabel).append(metricLabel(metric)).append(comparisonLabel(comparison, value));
        }
        return sb.toString();
    }

    private static String metricLabel(String metric) {
        return switch (metric) {
            case "monthlyVisits" -> "月訪問量";
            case "monthlyOrders" -> "月訂單量";
            case "monthlyRepurchase" -> "月復購訂單數據";
            case "monthlyRating" -> "月好評訂單數據";
            case "storeFavorites", "favoritesCount" -> "門店收藏";
            case "monthlyCustomers", "customerCount" -> "顧客數";
            default -> metric;
        };
    }

    private static String comparisonLabel(String comparison, String value) {
        return switch (comparison) {
            case "ranking" -> "排名前 " + value + " 名";
            case "percentage" -> "前 " + value + "% 的商家";
            case "absolute" -> "≥ " + value;
            default -> "≥ " + value;
        };
    }

    /** 根据算法条件 + 当前门店数据填充 LabelPrice 的资格信息 */
    private static void fillQualificationInfo(AdSignboardInventoryVO.LabelPrice lp,
                                              Map<String, Map<String, ScenarioCondition>> algoConditions,
                                              EvalContext ctx) {
        // 统计类标签无场景，默认合格
        if (lp.getScenario() == null) {
            lp.setQualified(true);
            lp.setConditionDesc(null);
            return;
        }
        // 对比类标签：查找算法配置中对应的场景条件
        String scenarioKey = "all_macau".equals(lp.getScenario()) ? "allMacau" : "district";
        Map<String, ScenarioCondition> labelConditions = algoConditions.get(lp.getLabelType());
        ScenarioCondition sc = labelConditions != null ? labelConditions.get(scenarioKey) : null;
        if (sc == null || sc.conditions.isEmpty()) {
            // 算法无此场景条件配置，默认合格
            lp.setQualified(true);
            lp.setConditionDesc(null);
            return;
        }
        lp.setConditionDesc(sc.conditionDesc.isEmpty() ? null : sc.conditionDesc);
        QualificationResult r = evaluate(scenarioKey, sc, ctx);
        lp.setQualified(r.qualified);
        lp.setActualDesc(r.actualDesc);
    }
}

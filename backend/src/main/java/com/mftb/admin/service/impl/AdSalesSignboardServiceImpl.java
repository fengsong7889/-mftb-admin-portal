package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingSignboardVO;
import com.mftb.admin.dto.AdSignboardInventoryVO;
import com.mftb.admin.dto.AdSignboardOrderRequest;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemSignboard;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemSignboardMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdPricingSignboardService;
import com.mftb.admin.service.AdSalesSignboardService;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.service.FinWriteChainService;
import com.mftb.admin.service.GiftService;
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
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
    private final AdPricingSignboardService pricingService;
    private final FinAccountService accountService;
    private final FinWriteChainService finWriteChainService;
    private final GiftService giftService;
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
        Set<String> purchased = purchasedCells(algoId, groupCode, today, endDate);

        AdSignboardInventoryVO vo = new AdSignboardInventoryVO();
        vo.setAlgoId(algoId);
        vo.setPresaleDays(pricing.getPresaleDays());
        vo.setRefundEnabled(pricing.getRefundEnabled());
        vo.setCancelFeeTiers(pricing.getCancelFeeTiers());

        // 加载算法配置中的场景资格条件
        Map<String, Map<String, ScenarioCondition>> algoConditions = loadAlgoConditions(pricing.getAlgoId());

        // 标签计价信息（含场景 + 资格条件）
        for (AdPricingSignboardVO.LabelPriceItem label : pricing.getSignboardItems()) {
            AdSignboardInventoryVO.LabelPrice lp = new AdSignboardInventoryVO.LabelPrice();
            lp.setLabelType(label.getLabelType());
            lp.setScenario(label.getScenario());
            lp.setEnabled(label.getEnabled());
            lp.setPricePerDay(label.getPrice());
            lp.setDiscountTiers(label.getDiscountTiers());
            // 填充资格条件信息
            fillQualificationInfo(lp, algoConditions);
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

        // 3. 重复购买校验
        Set<String> purchased = purchasedCells(request.getAlgoId(), request.getGroupCode(), today, endDate);
        for (String key : requestKeys) {
            if (purchased.contains(key)) {
                throw new BusinessException("該標籤在所选日期已購買，不能重複購買");
            }
        }

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

    /* ==================== 资格条件解析 ==================== */

    /** 场景资格条件（从算法配置解析） */
    private static class ScenarioCondition {
        String conditionDesc;
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
            String metricLabel = metricLabel(metric);
            String comparisonLabel = comparisonLabel(comparison, value);
            sb.append(scopeLabel).append(metricLabel).append(comparisonLabel);
        }
        return sb.toString();
    }

    private static String metricLabel(String metric) {
        return switch (metric) {
            case "monthlyVisits" -> "月訪問量";
            case "monthlyOrders" -> "月訂單量";
            case "monthlyRepurchase" -> "月復購率";
            case "monthlyRating" -> "月好評率";
            case "favoritesCount" -> "收藏人數";
            case "customerCount" -> "顧客數";
            default -> metric;
        };
    }

    private static String comparisonLabel(String comparison, String value) {
        return switch (comparison) {
            case "ranking" -> "排名前 " + value + " 名";
            case "percentage" -> "≥ " + value + "%";
            case "absolute" -> "≥ " + value;
            default -> "≥ " + value;
        };
    }

    /** 根据算法条件填充 LabelPrice 的资格信息 */
    private static void fillQualificationInfo(AdSignboardInventoryVO.LabelPrice lp,
                                              Map<String, Map<String, ScenarioCondition>> algoConditions) {
        // 统计类标签无场景，默认合格
        if (lp.getScenario() == null) {
            lp.setQualified(true);
            lp.setConditionDesc(null);
            return;
        }
        // 对比类标签：查找算法配置中对应的场景条件
        String scenarioKey = "all_macau".equals(lp.getScenario()) ? "allMacau" : "district";
        Map<String, ScenarioCondition> labelConditions = algoConditions.get(lp.getLabelType());
        if (labelConditions == null || !labelConditions.containsKey(scenarioKey)) {
            // 算法无此场景配置，默认合格
            lp.setQualified(true);
            lp.setConditionDesc(null);
            return;
        }
        ScenarioCondition sc = labelConditions.get(scenarioKey);
        String desc = sc != null ? sc.conditionDesc : "";
        lp.setConditionDesc(desc.isEmpty() ? null : desc);
        // 所有场景均允许选择，条件描述供前端展示
        lp.setQualified(true);
    }
}

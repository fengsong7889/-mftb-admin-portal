package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdHotInventoryVO;
import com.mftb.admin.dto.AdHotOrderRequest;
import com.mftb.admin.dto.AdHotQuoteVO;
import com.mftb.admin.dto.AdDiscountTier;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.service.DataScopeService;
import com.mftb.admin.util.HotDiscountPolicy;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemHot;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.AdOrderItemHotMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.service.AdOrderSupport;
import com.mftb.admin.service.AdPricingHotService;
import com.mftb.admin.service.AdSalesHotService;
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
    private final AdPricingHotService pricingService;
    private final AdOrderSupport orderSupport;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final BizMerchantGroupMapper groupMapper;
    private final DataScopeService dataScopeService;

    /* ==================== 库存查询 ==================== */

    @Override
    public AdHotInventoryVO inventory(Long algoId, String storeCode, String groupCode) {
        AdPricingHotVO pricing = requireActivePricing(algoId);
        if (StringUtils.hasText(groupCode)) requireGroupAccess(groupCode);
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
        vo.setDiscountEnabled(pricing.getDiscountEnabled());
        vo.setDiscountMode(pricing.getDiscountMode());
        vo.setSmallDiscountTiers(pricing.getSmallDiscountTiers());
        vo.setLargeDiscountTiers(pricing.getLargeDiscountTiers());
        vo.setRefundEnabled(pricing.getRefundEnabled());
        for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
            for (AdPricingHotVO.SkinPriceItem skin : pricing.getSkins()) {
                AdHotInventoryVO.Cell cell = new AdHotInventoryVO.Cell();
                cell.setBizDate(date);
                cell.setSkinName(skin.getSkinName());
                cell.setTemplateKey(skin.getTemplateKey());
                cell.setDisplayMode(skin.getDisplayMode());
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
        PreparedOrder prepared = prepareOrder(request);
        AdPricingHotVO pricing = prepared.pricing();
        AdHotQuoteVO quote = prepared.quote();
        BizStore store = prepared.store();
        String brand = pricing.getBrand();
        Integer channel = pricing.getChannel();
        LocalDateTime now = LocalDateTime.now();
        BigDecimal originalTotal = quote.originalAmount();
        BigDecimal actualTotal = quote.actualAmount();
        BigDecimal giftDeduction = quote.giftAmount();
        int giftDays = quote.giftDays();
        BigDecimal discountAmount = originalTotal.subtract(actualTotal);
        if (request.getExpectedAmount() != null && request.getExpectedAmount().compareTo(actualTotal) != 0) {
            throw new BusinessException("報價已變更，請重新確認付款金額");
        }

        // 6. 推广金账户校验 + 余额校验（仅实际需要推广金时才检查账户状态）
        orderSupport.requireSufficientBalance(request.getGroupCode(), brand, actualTotal);

        // 7. 写订单主表 + 明细
        String orderNo = bizSeqService.next(BizSeqService.RULE_AD_ORDER_POPULAR);

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(5); // 人气商家固定类型
        order.setAlgoId(pricing.getId()); // 解耦后存定价配置ID，用于已购格子查询
        order.setAlgoName(pricing.getAlgoName());
        order.setAlgoCode(pricing.getPricingNo()); // 存定价编号，用于订单列表展示"配置ID"
        order.setBrand(brand);
        order.setChannel(channel);
        order.setGroupCode(request.getGroupCode());
        order.setGroupName(orderSupport.resolveGroupName(request.getGroupCode()));
        order.setStoreCode(store != null ? store.getStoreCode() : request.getStoreCode());
        order.setStoreName(store != null ? store.getStoreName() : null);
        order.setBdEmpId(request.getBdEmpId());
        // 下单人快照: 当前登录的业务人员
        orderSupport.applyOperatorSnapshot(order);
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
        List<AdHotOrderRequest.CellSelection> cells = request.getCells();
        for (int i = 0; i < cells.size(); i++) {
            AdHotOrderRequest.CellSelection cell = cells.get(i);
            BigDecimal salePrice = allocateDailyAmount(actualTotal, cells.size(), i);
            AdOrderItemHot item = new AdOrderItemHot();
            item.setOrderId(order.getId());
            item.setOrderNo(orderNo);
            item.setBizDate(cell.getBizDate());
            item.setSkinName(cell.getSkinName());
            item.setOriginalPrice(quote.unitPrice());
            item.setSalePrice(salePrice);
            item.setRefundPrice(BigDecimal.ZERO);
            item.setDeliveryStatus(1);
            item.setDeleted(0);
            itemMapper.insert(item);
        }

        // 8. 扣减赠送天数余额并写消费流水（与订单同事务）
        orderSupport.deductGiftDays(GIFT_AD_TYPE, store, giftDays, orderNo,
                pricing.getPricingNo(), pricing.getAlgoName());

        // 9. 扣款 + 写消费明细（财务写入链: 按充值批次 FIFO 拆分挂批次号, 变动类别=广告类型）
        String changeType = "人氣商家";
        String finChannel = channel != null && channel == 4 ? "團購" : "外賣";
        orderSupport.writeAdConsume(order, request.getGroupCode(), brand, finChannel,
                actualTotal, changeType, request.getBdEmpId(), now);
        return AdOrderVO.from(order);
    }

    @Override
    @Transactional(readOnly = true)
    public AdHotQuoteVO quote(AdHotOrderRequest request) {
        return prepareOrder(request).quote();
    }

    private record PreparedOrder(AdPricingHotVO pricing, BizStore store, AdHotQuoteVO quote) { }

    /** 报价和下单唯一的校验、计价入口，无写操作。 */
    private PreparedOrder prepareOrder(AdHotOrderRequest request) {
        if (request == null || request.getAlgoId() == null || !StringUtils.hasText(request.getGroupCode())
                || request.getCells() == null || request.getCells().isEmpty()) throw new BusinessException("訂單信息不完整");
        Set<String> names = new HashSet<>();
        Set<LocalDate> dates = new HashSet<>();
        for (AdHotOrderRequest.CellSelection cell : request.getCells()) {
            if (cell == null || cell.getBizDate() == null || !StringUtils.hasText(cell.getSkinName())) throw new BusinessException("格子信息不完整");
            names.add(cell.getSkinName());
            if (names.size() > 1) throw new BusinessException("一張訂單只能購買一套皮膚，不能混購");
            if (!dates.add(cell.getBizDate())) throw new BusinessException("同一皮膚的購買日期不能重複");
        }
        requireGroupAccess(request.getGroupCode());
        AdPricingHotVO pricing = requireActivePricing(request.getAlgoId());
        BizMerchantGroup group = groupMapper.selectOne(new LambdaQueryWrapper<BizMerchantGroup>()
                .eq(BizMerchantGroup::getGroupCode, request.getGroupCode()).last("LIMIT 1"));
        if (group == null) throw new BusinessException("商家集團不存在");
        BizStore store = orderSupport.findStore(request.getStoreCode());
        if (StringUtils.hasText(request.getStoreCode()) && (store == null || !group.getId().equals(store.getGroupId()))) {
            throw new BusinessException("門店與商家集團不匹配");
        }
        if (store != null && StringUtils.hasText(store.getBrand()) && StringUtils.hasText(pricing.getBrand())
                && java.util.Arrays.stream(store.getBrand().split(",")).map(String::trim).noneMatch(pricing.getBrand()::equals)) {
            throw new BusinessException("門店與定價品牌不匹配");
        }
        requireNotBlocked(pricing, request.getStoreCode(), request.getGroupCode());
        LocalDate today = LocalDate.now();
        LocalDate endDate = today.plusDays(pricing.getPresaleDays() - 1L);
        if (dates.stream().anyMatch(date -> date.isBefore(today) || date.isAfter(endDate))) {
            throw new BusinessException("購買日期超出預售窗口(" + today + " ~ " + endDate + ")");
        }
        String skinName = names.iterator().next();
        AdPricingHotVO.SkinPriceItem skin = pricing.getSkins().stream().filter(s -> skinName.equals(s.getSkinName()))
                .findFirst().orElseThrow(() -> new BusinessException("皮膚未配置計價"));
        if (skin.getPrice() == null || skin.getPrice().signum() <= 0) throw new BusinessException("皮膚售價無效");
        Set<String> purchased = purchasedCells(request.getAlgoId(), request.getGroupCode(), today, endDate);
        if (dates.stream().anyMatch(date -> purchased.contains(cellKey(date, skinName)))) {
            throw new BusinessException("該皮膚在所選日期已購買，不能重複購買");
        }
        HotDiscountPolicy.Effective effective = HotDiscountPolicy.resolve(pricing, skin);
        AdDiscountTier matched = effective.match(dates.size());
        BigDecimal percent = matched == null ? BigDecimal.valueOf(100) : matched.discount();
        BigDecimal unitPrice = AdCalcUtils.round2(skin.getPrice());
        BigDecimal original = unitPrice.multiply(BigDecimal.valueOf(dates.size()));
        BigDecimal discounted = original.multiply(percent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        int giftDays = request.getGiftDays() == null ? 0 : request.getGiftDays();
        if (giftDays < 0 || giftDays > dates.size()) throw new BusinessException("贈送抵扣天數無效");
        BigDecimal gift = orderSupport.calcGiftDeduction(GIFT_AD_TYPE, store, giftDays, dates.size(), discounted);
        AdHotQuoteVO quote = new AdHotQuoteVO(pricing.getId(), skinName, skin.getDisplayMode(), dates.size(),
                effective.source(), matched == null ? null : matched.minDays().intValueExact(), percent,
                unitPrice, original, discounted, giftDays, gift, discounted.subtract(gift));
        return new PreparedOrder(pricing, store, quote);
    }

    private void requireGroupAccess(String groupCode) {
        Set<String> authorized = dataScopeService.resolveAuthorizedGroupCodes();
        if (authorized != null && !authorized.contains(groupCode)) throw new BusinessException("無權訪問該商家集團");
    }

    /** 分摊到分，余数分配给前几天，避免小额订单尾差出现负数。 */
    static BigDecimal allocateDailyAmount(BigDecimal total, int count, int index) {
        BigDecimal base = total.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);
        int remainder = total.subtract(base.multiply(BigDecimal.valueOf(count))).movePointRight(2).intValueExact();
        return index < remainder ? base.add(new BigDecimal("0.01")) : base;
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

    /** 皮肤销量统计: 有效订单(待推广/推广中/已推广)中每单每个皮肤记一次 */
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
        // 同一订单同一皮肤只记一次（一单多天只算一单销量）
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

package com.mftb.admin.service.impl;

import com.mftb.admin.service.support.AdStarAlgorithmParams;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingStarRequest;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdPricingStar;
import com.mftb.admin.entity.AdPricingStarRegion;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdPricingStarMapper;
import com.mftb.admin.mapper.AdPricingStarRegionMapper;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiConsumer;

/**
 * 无敌星星销售定价服务实现
 */
@Service
public class AdPricingStarServiceImpl extends
        AbstractAdPricingService<AdPricingStar, AdPricingStarVO, AdPricingStarRequest, AdPricingStarMapper>
        implements AdPricingStarService {

    private final AdPricingStarRegionMapper regionMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final BizSeqService bizSeqService;

    public AdPricingStarServiceImpl(AdPricingStarMapper pricingMapper, OperatorResolver operatorResolver,
                                    AdPricingStarRegionMapper regionMapper, AdAlgorithmMapper algorithmMapper,
                                    BizSeqService bizSeqService) {
        super(pricingMapper, operatorResolver);
        this.regionMapper = regionMapper;
        this.algorithmMapper = algorithmMapper;
        this.bizSeqService = bizSeqService;
    }

    /* ==================== 接口方法 — 签名各异不能提至基类 ==================== */

    @Override
    public PageResult<AdPricingStarVO> page(long page, long size, Long algoId, String brand, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdPricingStar> wrapper = new LambdaQueryWrapper<>();
        if (algoId != null) wrapper.eq(AdPricingStar::getAlgoId, algoId);
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingStar::getBrand, brand);
        if (status != null) wrapper.eq(AdPricingStar::getStatus, status);
        wrapper.orderByDesc(AdPricingStar::getId);

        Page<AdPricingStar> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingStarVO> records = result.getRecords().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingStarVO activeByAlgo(Long algoId) {
        AdPricingStar pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingStar>()
                        .eq(AdPricingStar::getAlgoId, algoId)
                        .eq(AdPricingStar::getStatus, 1)
                        .orderByDesc(AdPricingStar::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    /**
     * 按「算法 + 業務頻道」取价：頻道為 null 時退回舊口徑（取最新一條），
     * 僅供未升級的調用方兼容；購買鏈路必須傳頻道，否則同算法多頻道時會错配價格。
     */
    @Override
    public AdPricingStarVO activeByAlgoAndChannel(Long algoId, Integer channel) {
        if (channel == null) {
            return activeByAlgo(algoId);
        }
        AdPricingStar pricing = pricingMapper.selectOne(
                new LambdaQueryWrapper<AdPricingStar>()
                        .eq(AdPricingStar::getAlgoId, algoId)
                        .eq(AdPricingStar::getChannel, channel)
                        .eq(AdPricingStar::getStatus, 1)
                        .orderByDesc(AdPricingStar::getId)
                        .last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    @Override
    public List<Integer> listActiveChannels(Integer algoType, String brand) {
        LambdaQueryWrapper<AdPricingStar> wrapper = new LambdaQueryWrapper<AdPricingStar>()
                .select(AdPricingStar::getChannel)
                .eq(AdPricingStar::getStatus, 1)
                .groupBy(AdPricingStar::getChannel)
                .orderByAsc(AdPricingStar::getChannel);
        if (StringUtils.hasText(brand)) {
            wrapper.eq(AdPricingStar::getBrand, brand);
        }
        return pricingMapper.selectList(wrapper).stream()
                .map(AdPricingStar::getChannel)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    /* ==================== 创建/更新前校验钩子 ==================== */

    @Override
    protected void preCreate(AdPricingStarRequest request) {
        requireAlgorithm(request.getAlgoId(), request.getChannel());
        requireChannelUnique(request.getAlgoId(), request.getChannel(), null);
    }

    @Override
    protected void preUpdate(Long id, AdPricingStarRequest request) {
        requireAlgorithm(request.getAlgoId(), request.getChannel());
        requireChannelUnique(request.getAlgoId(), request.getChannel(), id);
    }

    /** 同一算法同一業務頻道只允許一條定價配置（與投流廣告同口径，避免購買页取价歧義） */
    private void requireChannelUnique(Long algoId, Integer channel, Long excludeId) {
        if (algoId == null || channel == null) {
            return;
        }
        LambdaQueryWrapper<AdPricingStar> wrapper = new LambdaQueryWrapper<AdPricingStar>()
                .eq(AdPricingStar::getAlgoId, algoId)
                .eq(AdPricingStar::getChannel, channel);
        if (excludeId != null) {
            wrapper.ne(AdPricingStar::getId, excludeId);
        }
        Long duplicated = pricingMapper.selectCount(wrapper);
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("該算法在此業務頻道已存在定價配置，請直接編輯");
        }
    }

    /* ==================== 抽象方法实现 ==================== */

    @Override
    protected AdPricingStarVO toVO(AdPricingStar entity) {
        AdPricingStarVO vo = AdPricingStarVO.from(entity);
        List<AdPricingStarRegion> regions = regionMapper.selectList(
                new LambdaQueryWrapper<AdPricingStarRegion>()
                        .eq(AdPricingStarRegion::getPricingId, entity.getId())
                        .orderByAsc(AdPricingStarRegion::getRegion));
        for (AdPricingStarRegion region : regions) {
            AdPricingStarVO.RegionPriceItem item = new AdPricingStarVO.RegionPriceItem();
            item.setId(region.getId());
            item.setRegion(region.getRegion());
            item.setDailyPrice(region.getDailyPrice());
            item.setDailySalesLimit(region.getDailySalesLimit() == null ? 1 : region.getDailySalesLimit());
            vo.getRegionPrices().add(item);
        }
        return vo;
    }

    @Override
    protected String nextPricingNo() {
        return bizSeqService.next(BizSeqService.RULE_PRICING_STAR);
    }

    @Override
    protected void applyRequest(AdPricingStar entity, AdPricingStarRequest request) {
        AdAlgorithm algorithm = requireAlgorithm(request.getAlgoId(), request.getChannel());
        int targetType = resolveTargetType(algorithm);
        boolean product = targetType == AdStarAlgorithmParams.PRODUCT;
        if (product) {
            // 商品维度全天口径：格子=商圈×日期，无餐段可售时段/餐段折扣/多时段梯度折扣。
            requireProductAllDay(request);
        }
        entity.setTargetType(targetType);
        entity.setAlgoId(algorithm.getId());
        entity.setAlgoName(algorithm.getAlgoName());
        entity.setBrand(StringUtils.hasText(request.getBrand()) ? request.getBrand() : algorithm.getBrand());
        // 商品星星固定团购到店频道（算法协议不携带频道，不能退回「取算法旧频道」的门店口径）。
        entity.setChannel(product ? GROUP_BUY_CHANNEL
                : request.getChannel() != null ? request.getChannel() : algorithm.getChannel());
        entity.setPresaleDays(request.getPresaleDays());
        entity.setRefundEnabled(request.getRefundEnabled() == null ? 1 : request.getRefundEnabled());
        entity.setDiscountTiers(product || request.getDiscountTiers() == null ? null : JsonUtils.toJson(request.getDiscountTiers()));
        entity.setCancelFeeTiers(request.getCancelFeeTiers() == null ? null : JsonUtils.toJson(request.getCancelFeeTiers()));
        entity.setBlockMerchant(request.getBlockMerchant() == null ? 2 : request.getBlockMerchant());
        entity.setBlockList(request.getBlockList() == null ? null : JsonUtils.toJson(request.getBlockList()));
        entity.setSellTimeSlots(product ? JsonUtils.toJson(List.of("fullDay"))
                : request.getSellTimeSlots() == null ? null : JsonUtils.toJson(request.getSellTimeSlots()));
        // 清理不在可售时段内的折扣字段，防止脏数据残留
        entity.setSlotDiscounts(request.getSlotDiscounts() == null ? null
                : JsonUtils.toJson(sanitizeSlotDiscounts(request.getSlotDiscounts(),
                        product ? List.of("fullDay") : request.getSellTimeSlots())));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    @Override
    protected void saveChildren(Long pricingId, AdPricingStarRequest request) {
        saveRegionPrices(pricingId, request);
    }

    @Override
    protected void deleteChildren(Long pricingId) {
        regionMapper.delete(new LambdaQueryWrapper<AdPricingStarRegion>()
                .eq(AdPricingStarRegion::getPricingId, pricingId));
    }

    /* ==================== 实体 Hook（一行实现） ==================== */

    @Override protected AdPricingStar newEntity() { return new AdPricingStar(); }
    @Override protected void setPricingNo(AdPricingStar e, String no) { e.setPricingNo(no); }
    @Override protected Integer getStatus(AdPricingStar e) { return e.getStatus(); }
    @Override protected void setStatus(AdPricingStar e, Integer s) { e.setStatus(s); }
    @Override protected void setUpdatedBy(AdPricingStar e, String u) { e.setUpdatedBy(u); }
    @Override protected void setDeleted(AdPricingStar e, int d) { e.setDeleted(d); }
    @Override protected Long getId(AdPricingStar e) { return e.getId(); }

    /* ==================== 内部方法 ==================== */

    /** 团购到店业务频道（RecommendChannel.GROUP_BUY=4）：商品星星定价唯一可用频道。 */
    private static final int GROUP_BUY_CHANNEL = 4;

    private AdAlgorithm requireAlgorithm(Long algoId, Integer channel) {
        AdAlgorithm algorithm = algorithmMapper.selectById(algoId);
        if (algorithm == null) {
            throw new BusinessException("關聯算法不存在");
        }
        // 商品星星不再被全局拒绝，但仅开放团购到店频道；门店星星/旧协议记录保持原样。
        Integer target = AdStarAlgorithmParams.starTargetType(algorithm);
        if (target != null && target == AdStarAlgorithmParams.PRODUCT && !Objects.equals(channel, GROUP_BUY_CHANNEL)) {
            throw new BusinessException(422, "商品無敵星星僅支持團購到店頻道定價");
        }
        return algorithm;
    }

    /** 推广对象快照：星星按协议 targetType，无协议旧记录按门店；非星星算法不参与商品口径。 */
    private static int resolveTargetType(AdAlgorithm algorithm) {
        Integer target = AdStarAlgorithmParams.starTargetType(algorithm);
        return target == null ? AdStarAlgorithmParams.STORE : target;
    }

    /** 商品维度全天口径安全校验（前端隐藏只是 UX，服务端必须拒绝餐段配置写入库）。 */
    private void requireProductAllDay(AdPricingStarRequest request) {
        if (request.getDiscountTiers() != null && !request.getDiscountTiers().isEmpty()) {
            throw new BusinessException(422, "商品定價不支持多時段梯度折扣");
        }
        List<String> slots = request.getSellTimeSlots();
        boolean allDayOnly = slots == null || slots.isEmpty()
                || (slots.size() == 1 && "fullDay".equals(slots.get(0)));
        if (!allDayOnly) {
            throw new BusinessException(422, "商品維度只支持全天售賣，不可指定餐段時段");
        }
        if (request.getSlotDiscounts() != null) {
            for (AdPricingStarRequest.RegionSlotDiscount discount : request.getSlotDiscounts()) {
                if (discount.getBreakfast() != null || discount.getLunch() != null || discount.getAfternoon() != null
                        || discount.getDinner() != null || discount.getSupper() != null) {
                    throw new BusinessException(422, "商品定價不支持餐段折扣，請只使用全時段折扣");
                }
            }
        }
    }

    private void saveRegionPrices(Long pricingId, AdPricingStarRequest request) {
        List<AdPricingStarRequest.RegionPrice> prices = request.getRegionPrices();
        if (prices == null || prices.isEmpty()) {
            return;
        }
        Set<Integer> seen = new HashSet<>();
        for (AdPricingStarRequest.RegionPrice price : prices) {
            if (price.getRegion() == null) {
                throw new BusinessException("商圈不能為空");
            }
            if (!seen.add(price.getRegion())) {
                throw new BusinessException("商圈配置重複");
            }
            AdPricingStarRegion region = new AdPricingStarRegion();
            region.setPricingId(pricingId);
            region.setRegion(price.getRegion());
            region.setDailyPrice(price.getDailyPrice() == null ? BigDecimal.ZERO : price.getDailyPrice());
            region.setDailySalesLimit(price.getDailySalesLimit() == null || price.getDailySalesLimit() < 1
                    ? 1 : price.getDailySalesLimit());
            region.setDeleted(0);
            regionMapper.insert(region);
        }
    }

    /**
     * 清理不在可售时段内的时段折扣字段:
     * 当 sellTimeSlots 为指定模式（非 fullDay）时，移除未勾选时段对应的折扣值，
     * 保证数据库中的 slotDiscounts 与 sellTimeSlots 保持一致。
     */
    private List<AdPricingStarRequest.RegionSlotDiscount> sanitizeSlotDiscounts(
            List<AdPricingStarRequest.RegionSlotDiscount> discounts, List<String> sellTimeSlots) {
        if (discounts == null || discounts.isEmpty()) return discounts;
        // 全部时段模式或空：无需清理
        if (sellTimeSlots == null || sellTimeSlots.isEmpty() || sellTimeSlots.contains("fullDay")) {
            return discounts;
        }
        Set<String> allowed = new HashSet<>(sellTimeSlots);
        // 时段字段名 → 清除方法映射
        Map<String, BiConsumer<AdPricingStarRequest.RegionSlotDiscount, Object>> slotClearMap = Map.of(
                "breakfast", (d, v) -> d.setBreakfast(null),
                "lunch",     (d, v) -> d.setLunch(null),
                "afternoon", (d, v) -> d.setAfternoon(null),
                "dinner",    (d, v) -> d.setDinner(null),
                "supper",    (d, v) -> d.setSupper(null)
        );
        for (AdPricingStarRequest.RegionSlotDiscount d : discounts) {
            for (var entry : slotClearMap.entrySet()) {
                if (!allowed.contains(entry.getKey())) {
                    entry.getValue().accept(d, null);
                }
            }
        }
        return discounts;
    }
}

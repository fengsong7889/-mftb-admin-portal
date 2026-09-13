package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdPricingTrafficRequest;
import com.mftb.admin.dto.AdPricingTrafficVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdPricingTraffic;
import com.mftb.admin.entity.AdPricingTrafficLadder;
import com.mftb.admin.entity.AdPricingTrafficTier;
import com.mftb.admin.mapper.AdPricingTrafficLadderMapper;
import com.mftb.admin.mapper.AdPricingTrafficMapper;
import com.mftb.admin.mapper.AdPricingTrafficTierMapper;
import com.mftb.admin.service.AdPricingTrafficService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

/**
 * 投流广告销售定价服务实现
 * <p>
 * 预付流量包模型：一个算法每个业务频道一条配置，
 * 每个频道可配置预设档位（流量包套餐）+ 自定义阶梯单价。
 */
@Service
public class AdPricingTrafficServiceImpl extends
        AbstractAdPricingService<AdPricingTraffic, AdPricingTrafficVO, AdPricingTrafficRequest, AdPricingTrafficMapper>
        implements AdPricingTrafficService {

    /** 自定义购买缺省起购量/步长 */
    private static final int DEFAULT_CUSTOM_MIN_QTY = 100;
    private static final int DEFAULT_CUSTOM_STEP = 100;

    private final AdPricingTrafficTierMapper tierMapper;
    private final AdPricingTrafficLadderMapper ladderMapper;
    private final BizSeqService bizSeqService;

    public AdPricingTrafficServiceImpl(AdPricingTrafficMapper pricingMapper, OperatorResolver operatorResolver,
                                       AdPricingTrafficTierMapper tierMapper, AdPricingTrafficLadderMapper ladderMapper,
                                       BizSeqService bizSeqService) {
        super(pricingMapper, operatorResolver);
        this.tierMapper = tierMapper;
        this.ladderMapper = ladderMapper;
        this.bizSeqService = bizSeqService;
    }

    /* ==================== 接口方法 — 签名各异不能提至基类 ==================== */

    @Override
    public PageResult<AdPricingTrafficVO> page(long page, long size, Long algoId, String brand,
                                               Integer bizChannel, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdPricingTraffic> wrapper = new LambdaQueryWrapper<>();
        if (algoId != null) wrapper.eq(AdPricingTraffic::getAlgoId, algoId);
        if (StringUtils.hasText(brand)) wrapper.eq(AdPricingTraffic::getBrand, brand);
        if (bizChannel != null) wrapper.eq(AdPricingTraffic::getBizChannel, bizChannel);
        if (status != null) wrapper.eq(AdPricingTraffic::getStatus, status);
        wrapper.orderByDesc(AdPricingTraffic::getId);

        Page<AdPricingTraffic> result = pricingMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdPricingTrafficVO> records = result.getRecords().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdPricingTrafficVO activeByAlgo(Long algoId, Integer bizChannel) {
        LambdaQueryWrapper<AdPricingTraffic> wrapper = new LambdaQueryWrapper<AdPricingTraffic>()
                .eq(AdPricingTraffic::getAlgoId, algoId)
                .eq(AdPricingTraffic::getStatus, 1);
        if (bizChannel != null) {
            wrapper.eq(AdPricingTraffic::getBizChannel, bizChannel);
        }
        AdPricingTraffic pricing = pricingMapper.selectOne(
                wrapper.orderByDesc(AdPricingTraffic::getId).last("LIMIT 1"));
        return pricing == null ? null : toVO(pricing);
    }

    @Override
    public List<AdPricingTrafficVO> listByAlgo(Long algoId) {
        List<AdPricingTraffic> list = pricingMapper.selectList(
                new LambdaQueryWrapper<AdPricingTraffic>()
                        .eq(AdPricingTraffic::getAlgoId, algoId)
                        .orderByAsc(AdPricingTraffic::getBizChannel));
        return list.stream().map(this::toVO).toList();
    }

    @Override
    public boolean hasActivePricing(Long algoId) {
        Long count = pricingMapper.selectCount(new LambdaQueryWrapper<AdPricingTraffic>()
                .eq(AdPricingTraffic::getAlgoId, algoId)
                .eq(AdPricingTraffic::getStatus, 1));
        return count != null && count > 0;
    }

    /* ==================== 创建/更新前校验钩子 ==================== */

    @Override
    protected void preCreate(AdPricingTrafficRequest request) {
        validateBizChannel(request.getBizChannel());
        // 同一算法同一业务频道仅允许一条配置（前端按频道分开配置）
        Long exists = pricingMapper.selectCount(new LambdaQueryWrapper<AdPricingTraffic>()
                .eq(AdPricingTraffic::getAlgoId, request.getAlgoId())
                .eq(AdPricingTraffic::getBizChannel, request.getBizChannel()));
        if (exists != null && exists > 0) {
            throw new BusinessException("該算法在此業務頻道已存在定價配置，請直接編輯");
        }
    }

    @Override
    protected void preUpdate(Long id, AdPricingTrafficRequest request) {
        AdPricingTraffic entity = require(id);
        // 算法与业务频道为配置主键维度，编辑时不允许变更
        if (request.getAlgoId() != null && !request.getAlgoId().equals(entity.getAlgoId())) {
            throw new BusinessException("不允許變更關聯算法");
        }
        if (request.getBizChannel() != null && !request.getBizChannel().equals(entity.getBizChannel())) {
            throw new BusinessException("不允許變更業務頻道");
        }
    }

    /* ==================== 抽象方法实现 ==================== */

    @Override
    protected AdPricingTrafficVO toVO(AdPricingTraffic entity) {
        AdPricingTrafficVO vo = AdPricingTrafficVO.from(entity);
        List<AdPricingTrafficTier> tiers = tierMapper.selectList(
                new LambdaQueryWrapper<AdPricingTrafficTier>()
                        .eq(AdPricingTrafficTier::getPricingId, entity.getId())
                        .orderByAsc(AdPricingTrafficTier::getSort)
                        .orderByAsc(AdPricingTrafficTier::getId));
        for (AdPricingTrafficTier tier : tiers) {
            AdPricingTrafficVO.TierItem item = new AdPricingTrafficVO.TierItem();
            item.setId(tier.getId());
            item.setTierName(tier.getTierName());
            item.setImpressions(tier.getImpressions());
            item.setPrice(tier.getPrice());
            item.setValidityDays(tier.getValidityDays());
            item.setOnSale(tier.getOnSale());
            item.setSort(tier.getSort());
            item.setDiscountEnabled(tier.getDiscountEnabled());
            item.setDiscount(tier.getDiscount());
            item.setDiscountTimeMode(tier.getDiscountTimeMode());
            item.setDiscountStartDate(tier.getDiscountStartDate());
            item.setDiscountEndDate(tier.getDiscountEndDate());
            vo.getTiers().add(item);
        }
        List<AdPricingTrafficLadder> ladder = ladderMapper.selectList(
                new LambdaQueryWrapper<AdPricingTrafficLadder>()
                        .eq(AdPricingTrafficLadder::getPricingId, entity.getId())
                        .orderByAsc(AdPricingTrafficLadder::getMinQty));
        for (AdPricingTrafficLadder row : ladder) {
            AdPricingTrafficVO.LadderItem item = new AdPricingTrafficVO.LadderItem();
            item.setId(row.getId());
            item.setMinQty(row.getMinQty());
            item.setMaxQty(row.getMaxQty());
            item.setUnitPrice(row.getUnitPrice());
            vo.getLadder().add(item);
        }
        return vo;
    }

    @Override
    protected String nextPricingNo() {
        return bizSeqService.next(BizSeqService.RULE_PRICING_TRAFFIC);
    }

    @Override
    protected void applyRequest(AdPricingTraffic entity, AdPricingTrafficRequest request) {
        entity.setAlgoId(request.getAlgoId());
        if (StringUtils.hasText(request.getAlgoName())) {
            entity.setAlgoName(request.getAlgoName());
        }
        entity.setBrand(request.getBrand());
        entity.setBizChannel(request.getBizChannel());
        entity.setCustomMinQty(request.getCustomMinQty() == null || request.getCustomMinQty() < 1
                ? DEFAULT_CUSTOM_MIN_QTY : request.getCustomMinQty());
        entity.setCustomStep(request.getCustomStep() == null || request.getCustomStep() < 1
                ? DEFAULT_CUSTOM_STEP : request.getCustomStep());
        entity.setRefundEnabled(request.getRefundEnabled() == null ? 1 : request.getRefundEnabled());
        entity.setRefundFeePercent(request.getRefundFeePercent() == null ? 0 : request.getRefundFeePercent());
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    @Override
    protected void saveChildren(Long pricingId, AdPricingTrafficRequest request) {
        saveTiers(pricingId, request);
        saveLadder(pricingId, request);
    }

    @Override
    protected void deleteChildren(Long pricingId) {
        tierMapper.delete(new LambdaQueryWrapper<AdPricingTrafficTier>()
                .eq(AdPricingTrafficTier::getPricingId, pricingId));
        ladderMapper.delete(new LambdaQueryWrapper<AdPricingTrafficLadder>()
                .eq(AdPricingTrafficLadder::getPricingId, pricingId));
    }

    /* ==================== 实体 Hook（一行实现） ==================== */

    @Override protected AdPricingTraffic newEntity() { return new AdPricingTraffic(); }
    @Override protected void setPricingNo(AdPricingTraffic e, String no) { e.setPricingNo(no); }
    @Override protected Integer getStatus(AdPricingTraffic e) { return e.getStatus(); }
    @Override protected void setStatus(AdPricingTraffic e, Integer s) { e.setStatus(s); }
    @Override protected void setUpdatedBy(AdPricingTraffic e, String u) { e.setUpdatedBy(u); }
    @Override protected void setDeleted(AdPricingTraffic e, int d) { e.setDeleted(d); }
    @Override protected Long getId(AdPricingTraffic e) { return e.getId(); }

    /* ==================== 内部方法 ==================== */

    private void validateBizChannel(Integer bizChannel) {
        if (bizChannel == null || bizChannel < 1 || bizChannel > 3) {
            throw new BusinessException("非法的業務頻道: " + bizChannel);
        }
    }

    /** 预设档位保存（名称/曝光/价格必填，与前端套餐包完整性校验一致） */
    private void saveTiers(Long pricingId, AdPricingTrafficRequest request) {
        List<AdPricingTrafficRequest.TierItem> tiers = request.getTiers();
        if (tiers == null || tiers.isEmpty()) {
            return;
        }
        int sort = 1;
        for (AdPricingTrafficRequest.TierItem tier : tiers) {
            if (!StringUtils.hasText(tier.getTierName())) {
                throw new BusinessException("套餐包名稱不能為空");
            }
            if (tier.getImpressions() == null || tier.getImpressions() < 1) {
                throw new BusinessException("套餐包「" + tier.getTierName() + "」曝光次數不能為空");
            }
            if (tier.getPrice() == null || tier.getPrice().signum() <= 0) {
                throw new BusinessException("套餐包「" + tier.getTierName() + "」價格不能為空");
            }
            AdPricingTrafficTier entity = new AdPricingTrafficTier();
            entity.setPricingId(pricingId);
            entity.setTierName(tier.getTierName());
            entity.setImpressions(tier.getImpressions());
            entity.setPrice(tier.getPrice());
            entity.setValidityDays(tier.getValidityDays());
            entity.setOnSale(tier.getOnSale() == null ? 1 : tier.getOnSale());
            entity.setSort(tier.getSort() == null ? sort : tier.getSort());
            entity.setDiscountEnabled(tier.getDiscountEnabled() == null ? 0 : tier.getDiscountEnabled());
            entity.setDiscount(tier.getDiscount());
            entity.setDiscountTimeMode(StringUtils.hasText(tier.getDiscountTimeMode())
                    ? tier.getDiscountTimeMode() : "unlimited");
            entity.setDiscountStartDate(tier.getDiscountStartDate());
            entity.setDiscountEndDate(tier.getDiscountEndDate());
            entity.setDeleted(0);
            tierMapper.insert(entity);
            sort++;
        }
    }

    /**
     * 阶梯单价保存：按 minQty 升序归一化，上限自动推导 = 下一梯度下限 − 1，
     * 末档上限为 0（无上限），与前端「仅配置下限」的交互一致。
     */
    private void saveLadder(Long pricingId, AdPricingTrafficRequest request) {
        List<AdPricingTrafficRequest.LadderItem> ladder = request.getLadder();
        if (ladder == null || ladder.isEmpty()) {
            return;
        }
        List<AdPricingTrafficRequest.LadderItem> sorted = ladder.stream()
                .sorted(Comparator.comparingInt(row -> row.getMinQty() == null ? 0 : row.getMinQty()))
                .toList();
        for (int i = 0; i < sorted.size(); i++) {
            AdPricingTrafficRequest.LadderItem row = sorted.get(i);
            if (row.getMinQty() == null || row.getMinQty() < 1) {
                throw new BusinessException("階梯單價區間下限不合法");
            }
            if (row.getUnitPrice() == null || row.getUnitPrice().signum() <= 0) {
                throw new BusinessException("階梯單價必須大於 0");
            }
            int maxQty = i < sorted.size() - 1
                    ? (sorted.get(i + 1).getMinQty() == null ? 0 : sorted.get(i + 1).getMinQty() - 1)
                    : 0;
            AdPricingTrafficLadder entity = new AdPricingTrafficLadder();
            entity.setPricingId(pricingId);
            entity.setMinQty(row.getMinQty());
            entity.setMaxQty(maxQty);
            entity.setUnitPrice(row.getUnitPrice());
            entity.setSort(i + 1);
            entity.setDeleted(0);
            ladderMapper.insert(entity);
        }
    }
}

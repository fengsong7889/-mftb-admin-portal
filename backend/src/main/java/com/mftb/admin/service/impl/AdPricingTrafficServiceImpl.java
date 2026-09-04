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
import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
public class AdPricingTrafficServiceImpl implements AdPricingTrafficService {

    /** 自定义购买缺省起购量/步长 */
    private static final int DEFAULT_CUSTOM_MIN_QTY = 100;
    private static final int DEFAULT_CUSTOM_STEP = 100;

    private final AdPricingTrafficMapper pricingMapper;
    private final AdPricingTrafficTierMapper tierMapper;
    private final AdPricingTrafficLadderMapper ladderMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

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
    public AdPricingTrafficVO detail(Long id) {
        return toVO(require(id));
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

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingTrafficVO create(AdPricingTrafficRequest request) {
        validateBizChannel(request.getBizChannel());
        // 同一算法同一业务频道仅允许一条配置（前端按频道分开配置）
        Long exists = pricingMapper.selectCount(new LambdaQueryWrapper<AdPricingTraffic>()
                .eq(AdPricingTraffic::getAlgoId, request.getAlgoId())
                .eq(AdPricingTraffic::getBizChannel, request.getBizChannel()));
        if (exists != null && exists > 0) {
            throw new BusinessException("該算法在此業務頻道已存在定價配置，請直接編輯");
        }

        AdPricingTraffic entity = new AdPricingTraffic();
        // 定价编号：按编号生成规则 config_pricing_traffic（DJTL + YYYYMMDD + 3位）
        entity.setPricingNo(bizSeqService.next(BizSeqService.RULE_PRICING_TRAFFIC));
        applyRequest(entity, request);
        if (entity.getStatus() == null) {
            entity.setStatus(1);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        pricingMapper.insert(entity);

        saveTiers(entity.getId(), request);
        saveLadder(entity.getId(), request);
        return detail(entity.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdPricingTrafficVO update(Long id, AdPricingTrafficRequest request) {
        AdPricingTraffic entity = require(id);
        // 算法与业务频道为配置主键维度，编辑时不允许变更
        if (request.getAlgoId() != null && !request.getAlgoId().equals(entity.getAlgoId())) {
            throw new BusinessException("不允許變更關聯算法");
        }
        if (request.getBizChannel() != null && !request.getBizChannel().equals(entity.getBizChannel())) {
            throw new BusinessException("不允許變更業務頻道");
        }
        applyRequest(entity, request);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);

        // 档位/阶梯整体替换：旧明细逻辑删除后写入新明细
        tierMapper.delete(new LambdaQueryWrapper<AdPricingTrafficTier>()
                .eq(AdPricingTrafficTier::getPricingId, id));
        ladderMapper.delete(new LambdaQueryWrapper<AdPricingTrafficLadder>()
                .eq(AdPricingTrafficLadder::getPricingId, id));
        saveTiers(id, request);
        saveLadder(id, request);
        return detail(id);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdPricingTraffic entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        require(id);
        pricingMapper.deleteById(id);
        tierMapper.delete(new LambdaQueryWrapper<AdPricingTrafficTier>()
                .eq(AdPricingTrafficTier::getPricingId, id));
        ladderMapper.delete(new LambdaQueryWrapper<AdPricingTrafficLadder>()
                .eq(AdPricingTrafficLadder::getPricingId, id));
    }

    /* ==================== 内部方法 ==================== */

    private AdPricingTraffic require(Long id) {
        AdPricingTraffic entity = pricingMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("计价配置不存在");
        }
        return entity;
    }

    private void validateBizChannel(Integer bizChannel) {
        if (bizChannel == null || bizChannel < 1 || bizChannel > 3) {
            throw new BusinessException("非法的業務頻道: " + bizChannel);
        }
    }

    private void applyRequest(AdPricingTraffic entity, AdPricingTrafficRequest request) {
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

    private AdPricingTrafficVO toVO(AdPricingTraffic entity) {
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
}

package com.mftb.admin.service.impl;

import cn.hutool.extra.pinyin.PinyinUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdAlgorithmRequest;
import com.mftb.admin.dto.AdAlgorithmVO;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.dto.AdPricingReviveVO;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdWaterfall;
import com.mftb.admin.entity.AdWaterfallSlot;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdWaterfallMapper;
import com.mftb.admin.mapper.AdWaterfallSlotMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdAlgorithmService;
import com.mftb.admin.service.AdPricingHotService;
import com.mftb.admin.service.AdPricingReviveService;
import com.mftb.admin.service.AdPricingSignboardService;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 推广算法库服务实现
 */
@Service
@RequiredArgsConstructor
public class AdAlgorithmServiceImpl implements AdAlgorithmService {

    private final AdAlgorithmMapper algorithmMapper;
    private final AdWaterfallSlotMapper waterfallSlotMapper;
    private final AdWaterfallMapper waterfallMapper;
    private final AdPricingStarService pricingService;
    private final AdPricingReviveService revivePricingService;
    private final AdPricingHotService hotPricingService;
    private final AdPricingSignboardService signboardPricingService;
    private final BizStoreMapper storeMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    @Override
    public PageResult<AdAlgorithmVO> page(long page, long size, Integer algoType, String brand,
                                          Integer channel, Integer status, String keyword, String storeCode, Boolean hasPricing) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdAlgorithm> wrapper = new LambdaQueryWrapper<>();
        if (algoType != null) wrapper.eq(AdAlgorithm::getAlgoType, algoType);
        if (StringUtils.hasText(brand)) wrapper.eq(AdAlgorithm::getBrand, brand);
        if (channel != null) wrapper.eq(AdAlgorithm::getChannel, channel);
        if (status != null) wrapper.eq(AdAlgorithm::getStatus, status);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(AdAlgorithm::getAlgoName, keyword)
                    .or().like(AdAlgorithm::getAlgoCode, keyword));
        }
        wrapper.orderByDesc(AdAlgorithm::getId);

        Page<AdAlgorithm> result = algorithmMapper.selectPage(new Page<>(page, size), wrapper);
        List<AdAlgorithmVO> records = result.getRecords().stream()
                .map(AdAlgorithmVO::from)
                .toList();
        // 销售菜单场景: 过滤掉对该门店屏蔽的算法（规则6）
        if (StringUtils.hasText(storeCode)) {
            int before = records.size();
            records = records.stream()
                    .filter(algo -> !isBlockedForStore(algo.getId(), storeCode))
                    .toList();
            long adjustedTotal = Math.max(0, result.getTotal() - (before - records.size()));
            // hasPricing: 进一步过滤无启用定价的算法
            if (Boolean.TRUE.equals(hasPricing)) {
                int beforePricing = records.size();
                records = records.stream()
                        .filter(algo -> hasActivePricing(algo.getId(), algo.getAlgoType()))
                        .toList();
                adjustedTotal = Math.max(0, adjustedTotal - (beforePricing - records.size()));
            }
            return new PageResult<>(records, adjustedTotal);
        }
        // hasPricing: 过滤无启用定价的算法
        if (Boolean.TRUE.equals(hasPricing)) {
            int before = records.size();
            records = records.stream()
                    .filter(algo -> hasActivePricing(algo.getId(), algo.getAlgoType()))
                    .toList();
            long adjustedTotal = Math.max(0, result.getTotal() - (before - records.size()));
            return new PageResult<>(records, adjustedTotal);
        }
        return new PageResult<>(records, result.getTotal());
    }

    /** 判断算法是否有啟用中的定價配置 */
    private boolean hasActivePricing(Long algoId, Integer algoType) {
        if (algoId == null || algoType == null) return false;
        if (algoType == 3) {
            return revivePricingService.activeByAlgo(algoId) != null;
        } else if (algoType == 5) {
            return hotPricingService.activeByAlgo(algoId) != null;
        } else if (algoType == 13) {
            // 金字招牌：查獨立計價表，且需至少有一個啟用的標籤定價
            var pricing = signboardPricingService.activeByAlgo(algoId);
            if (pricing == null) return false;
            return pricing.getSignboardItems() != null && pricing.getSignboardItems().stream()
                    .anyMatch(item -> Boolean.TRUE.equals(item.getEnabled()) && item.getPrice() != null && item.getPrice().doubleValue() > 0);
        } else {
            return pricingService.activeByAlgo(algoId) != null;
        }
    }

    /** 该算法启用中的定价是否屏蔽了指定门店（含其所属集团），按算法类型取对应计价配置 */
    private boolean isBlockedForStore(Long algoId, String storeCode) {
        Integer blockMerchant;
        String blockListJson;
        AdAlgorithm algorithm = algorithmMapper.selectById(algoId);
        if (algorithm != null && algorithm.getAlgoType() != null && algorithm.getAlgoType() == 3) {
            AdPricingReviveVO pricing = revivePricingService.activeByAlgo(algoId);
            if (pricing == null || pricing.getBlockMerchant() == null || pricing.getBlockMerchant() != 1) {
                return false;
            }
            blockMerchant = pricing.getBlockMerchant();
            blockListJson = pricing.getBlockList();
        } else if (algorithm != null && algorithm.getAlgoType() != null && algorithm.getAlgoType() == 5) {
            AdPricingHotVO pricing = hotPricingService.activeByAlgo(algoId);
            if (pricing == null || pricing.getBlockMerchant() == null || pricing.getBlockMerchant() != 1) {
                return false;
            }
            blockMerchant = pricing.getBlockMerchant();
            blockListJson = pricing.getBlockList();
        } else {
            AdPricingStarVO pricing = pricingService.activeByAlgo(algoId);
            if (pricing == null || pricing.getBlockMerchant() == null || pricing.getBlockMerchant() != 1) {
                return false;
            }
            blockMerchant = pricing.getBlockMerchant();
            blockListJson = pricing.getBlockList();
        }
        BizStore store = storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                .eq(BizStore::getStoreCode, storeCode)
                .last("LIMIT 1"));
        String groupCode = null;
        if (store != null && store.getGroupId() != null) {
            BizMerchantGroup group = groupMapper.selectById(store.getGroupId());
            groupCode = group != null ? group.getGroupCode() : null;
        }
        for (Map<String, Object> entry : JsonUtils.parseMapList(blockListJson)) {
            String entryStore = entry.get("storeCode") == null ? null : String.valueOf(entry.get("storeCode"));
            String entryGroup = entry.get("groupCode") == null ? null : String.valueOf(entry.get("groupCode"));
            if (storeCode.equals(entryStore)) {
                return true;
            }
            if (groupCode != null && groupCode.equals(entryGroup)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public AdAlgorithmVO detail(Long id) {
        return AdAlgorithmVO.from(require(id));
    }

    @Override
    public AdAlgorithmVO getByCode(String algoCode) {
        if (!StringUtils.hasText(algoCode)) {
            throw new BusinessException("算法ID不能为空");
        }
        AdAlgorithm entity = algorithmMapper.selectOne(
                new LambdaQueryWrapper<AdAlgorithm>()
                        .eq(AdAlgorithm::getAlgoCode, algoCode.trim())
                        .last("LIMIT 1"));
        if (entity == null) {
            throw new BusinessException("算法不存在: " + algoCode);
        }
        return AdAlgorithmVO.from(entity);
    }

    @Override
    public AdAlgorithmVO create(AdAlgorithmRequest request) {
        AdAlgorithm entity = new AdAlgorithm();
        entity.setAlgoCode(generateCode(request.getAlgoName(), request.getAlgoType()));
        applyRequest(entity, request);
        if (entity.getStatus() == null) {
            entity.setStatus(1);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        algorithmMapper.insert(entity);
        return AdAlgorithmVO.from(entity);
    }

    @Override
    public AdAlgorithmVO update(Long id, AdAlgorithmRequest request) {
        AdAlgorithm entity = require(id);
        applyRequest(entity, request);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        algorithmMapper.updateById(entity);
        return AdAlgorithmVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdAlgorithm entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        algorithmMapper.updateById(entity);
        // 停用时级联删除引用该算法的瀑布流坑位
        if (status == 2) {
            cascadeDeleteSlots(entity.getAlgoCode());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        AdAlgorithm entity = require(id);
        // 删除时级联删除引用该算法的瀑布流坑位
        cascadeDeleteSlots(entity.getAlgoCode());
        algorithmMapper.deleteById(id);
    }

    /** 级联删除引用指定算法编码的瀑布流坑位记录 */
    private void cascadeDeleteSlots(String algoCode) {
        if (algoCode == null) return;
        waterfallSlotMapper.delete(new LambdaQueryWrapper<AdWaterfallSlot>()
                .eq(AdWaterfallSlot::getAlgoId, algoCode));
    }

    @Override
    public List<Map<String, Object>> findWaterfallReferences(Long algoId) {
        AdAlgorithm algo = algorithmMapper.selectById(algoId);
        if (algo == null || algo.getAlgoCode() == null) {
            return List.of();
        }
        String algoCode = algo.getAlgoCode();
        List<Map<String, Object>> result = new ArrayList<>();

        // 1. 查询坑位引用（biz_ad_waterfall_slot）
        List<AdWaterfallSlot> slots = waterfallSlotMapper.selectList(
                new LambdaQueryWrapper<AdWaterfallSlot>()
                        .eq(AdWaterfallSlot::getAlgoId, algoCode));
        if (!slots.isEmpty()) {
            List<Long> waterfallIds = slots.stream()
                    .map(AdWaterfallSlot::getWaterfallId)
                    .distinct()
                    .toList();
            Map<Long, AdWaterfall> waterfallMap = waterfallMapper.selectBatchIds(waterfallIds).stream()
                    .collect(java.util.stream.Collectors.toMap(AdWaterfall::getId, Function.identity()));
            for (AdWaterfallSlot slot : slots) {
                AdWaterfall w = waterfallMap.get(slot.getWaterfallId());
                if (w != null) {
                    Map<String, Object> ref = new HashMap<>();
                    ref.put("strategyCode", w.getStrategyCode());
                    ref.put("strategyName", w.getStrategyName());
                    ref.put("slotPosition", slot.getSlotPosition());
                    ref.put("refType", "slot");
                    result.add(ref);
                }
            }
        }

        // 2. 查询自然流量兜底引用（biz_ad_waterfall.natural_algo_id）
        List<AdWaterfall> naturalRefs = waterfallMapper.selectList(
                new LambdaQueryWrapper<AdWaterfall>()
                        .eq(AdWaterfall::getNaturalAlgoId, algoCode));
        for (AdWaterfall w : naturalRefs) {
            Map<String, Object> ref = new HashMap<>();
            ref.put("strategyCode", w.getStrategyCode());
            ref.put("strategyName", w.getStrategyName());
            ref.put("slotPosition", null);
            ref.put("refType", "natural");
            result.add(ref);
        }

        return result;
    }

    private AdAlgorithm require(Long id) {
        AdAlgorithm entity = algorithmMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("算法不存在");
        }
        return entity;
    }

    private void applyRequest(AdAlgorithm entity, AdAlgorithmRequest request) {
        entity.setAlgoName(request.getAlgoName());
        entity.setAlgoType(request.getAlgoType());
        entity.setBrand(request.getBrand());
        entity.setChannel(request.getChannel());
        entity.setPlacementInterface(request.getPlacementInterface());
        entity.setSlotCount(request.getSlotCount());
        entity.setParams(request.getParams() == null ? null : JsonUtils.toJson(request.getParams()));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    /**
     * 生成算法ID：优先按「编号生成规则」(algo_* 规则，如 SFWD + YYYYMMDD + 3位序号)；
     * 未配置规则的算法类型退回旧规则：拼音首字母前缀 + 5位自增序号（每个算法模块独立排序）
     * <p>
     * 旧规则：
     * 1. 取算法名称前2个汉字的拼音首字母作为前缀（如「無敵星星」→ WD）
     * 2. 若不同 algoType 模块前缀冲突，追加第3个字的首字母（如 WDG）
     * 3. 仍冲突则追加 algoType 数字（如 WD1）
     * 4. 序号取同前缀下最大序号 +1，格式 %05d
     * 5. 若名称非中文导致无法提取字母前缀，则按 algoType 使用固定兜底前缀
     */
    private String generateCode(String algoName, Integer algoType) {
        String ruleKey = BizSeqService.algoRuleKey(algoType);
        if (ruleKey != null) {
            return bizSeqService.next(ruleKey);
        }
        String prefix = buildPrefix(algoName, algoType);
        int maxSeq = maxSeqForPrefix(prefix);
        return prefix + String.format("%05d", maxSeq + 1);
    }

    /** algoType → 固定兜底前缀（当名称无法提取合法字母前缀时使用） */
    private static final Map<Integer, String> TYPE_FALLBACK_PREFIX = Map.of(
            1, "WD",   // 無敵星星
            2, "XD",   // 新店廣告
            3, "PH",   // 盤活復蘇
            4, "LL",   // 流量廣告
            5, "RQ"    // 人氣商家
    );

    /** 根据算法名称构建编码前缀 */
    private String buildPrefix(String algoName, Integer algoType) {
        if (!StringUtils.hasText(algoName) || algoName.length() < 2) {
            return fallbackPrefix(algoType);
        }
        String two = PinyinUtil.getFirstLetter(algoName.substring(0, 2), "").toUpperCase();
        // 校验：前缀必须为纯英文字母，非中文名称（数字/符号等）无法产生合法前缀
        if (!two.matches("[A-Z]+")) {
            return fallbackPrefix(algoType);
        }
        // 检查是否与不同 algoType 模块冲突
        List<AdAlgorithm> existing = algorithmMapper.selectList(
                new LambdaQueryWrapper<AdAlgorithm>()
                        .select(AdAlgorithm::getAlgoCode, AdAlgorithm::getAlgoType)
                        .likeRight(AdAlgorithm::getAlgoCode, two)
                        .ne(AdAlgorithm::getAlgoType, algoType)
                        .last("LIMIT 1"));
        if (existing.isEmpty()) {
            return two;
        }
        // 冲突 → 追加第3个字符的首字母
        if (algoName.length() >= 3) {
            String third = PinyinUtil.getFirstLetter(algoName.substring(2, 3), "").toUpperCase();
            String three = two + third;
            List<AdAlgorithm> existing3 = algorithmMapper.selectList(
                    new LambdaQueryWrapper<AdAlgorithm>()
                            .select(AdAlgorithm::getAlgoCode, AdAlgorithm::getAlgoType)
                            .likeRight(AdAlgorithm::getAlgoCode, three)
                            .ne(AdAlgorithm::getAlgoType, algoType)
                            .last("LIMIT 1"));
            if (existing3.isEmpty()) {
                return three;
            }
        }
        // 仍冲突 → 追加 algoType 数字
        return two + algoType;
    }

    /** 按 algoType 取兜底前缀，未知类型默认 ALG */
    private String fallbackPrefix(Integer algoType) {
        return TYPE_FALLBACK_PREFIX.getOrDefault(algoType, "ALG");
    }

    /** 查询指定前缀下的最大序号 */
    private int maxSeqForPrefix(String prefix) {
        List<AdAlgorithm> all = algorithmMapper.selectList(
                new LambdaQueryWrapper<AdAlgorithm>()
                        .select(AdAlgorithm::getAlgoCode)
                        .likeRight(AdAlgorithm::getAlgoCode, prefix));
        int maxSeq = 0;
        for (AdAlgorithm algo : all) {
            if (!StringUtils.hasText(algo.getAlgoCode())) continue;
            String suffix = algo.getAlgoCode().substring(prefix.length());
            try {
                maxSeq = Math.max(maxSeq, Integer.parseInt(suffix));
            } catch (NumberFormatException ignored) {
            }
        }
        return maxSeq;
    }
}

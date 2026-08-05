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
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdAlgorithmService;
import com.mftb.admin.service.AdPricingHotService;
import com.mftb.admin.service.AdPricingReviveService;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 推广算法库服务实现
 */
@Service
@RequiredArgsConstructor
public class AdAlgorithmServiceImpl implements AdAlgorithmService {

    private final AdAlgorithmMapper algorithmMapper;
    private final AdPricingStarService pricingService;
    private final AdPricingReviveService revivePricingService;
    private final AdPricingHotService hotPricingService;
    private final BizStoreMapper storeMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AdAlgorithmVO> page(long page, long size, Integer algoType, String brand,
                                          Integer channel, Integer status, String keyword, String storeCode) {
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
            return new PageResult<>(records, Math.max(0, result.getTotal() - (before - records.size())));
        }
        return new PageResult<>(records, result.getTotal());
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
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdAlgorithm entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        algorithmMapper.updateById(entity);
    }

    @Override
    public void delete(Long id) {
        require(id);
        algorithmMapper.deleteById(id);
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
     * 生成算法编码：拼音首字母前缀 + 5位自增序号（每个算法模块独立排序）
     * <p>
     * 规则：
     * 1. 取算法名称前2个汉字的拼音首字母作为前缀（如「無敵星星」→ WD）
     * 2. 若不同 algoType 模块前缀冲突，追加第3个字的首字母（如 WDG）
     * 3. 仍冲突则追加 algoType 数字（如 WD1）
     * 4. 序号取同前缀下最大序号 +1，格式 %05d
     */
    private String generateCode(String algoName, Integer algoType) {
        String prefix = buildPrefix(algoName, algoType);
        int maxSeq = maxSeqForPrefix(prefix);
        return prefix + String.format("%05d", maxSeq + 1);
    }

    /** 根据算法名称构建编码前缀 */
    private String buildPrefix(String algoName, Integer algoType) {
        if (!StringUtils.hasText(algoName) || algoName.length() < 2) {
            return "ALG";
        }
        String two = PinyinUtil.getFirstLetter(algoName.substring(0, 2), "").toUpperCase();
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

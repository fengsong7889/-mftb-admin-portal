package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdAlgorithmRequest;
import com.mftb.admin.dto.AdAlgorithmVO;
import com.mftb.admin.dto.AdPricingStarVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdAlgorithmService;
import com.mftb.admin.service.AdPricingStarService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 推广算法库服务实现
 */
@Service
@RequiredArgsConstructor
public class AdAlgorithmServiceImpl implements AdAlgorithmService {

    /** 算法编码尾部数字序号 */
    private static final Pattern CODE_SEQ = Pattern.compile("(\\d+)$");

    private final AdAlgorithmMapper algorithmMapper;
    private final AdPricingStarService pricingService;
    private final BizStoreMapper storeMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AdAlgorithmVO> page(long page, long size, Integer algoType, String brand,
                                          Integer channel, Integer status, String keyword, String storeCode) {
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

    /** 该算法启用中的定价是否屏蔽了指定门店（含其所属集团） */
    private boolean isBlockedForStore(Long algoId, String storeCode) {
        AdPricingStarVO pricing = pricingService.activeByAlgo(algoId);
        if (pricing == null || pricing.getBlockMerchant() == null || pricing.getBlockMerchant() != 1) {
            return false;
        }
        BizStore store = storeMapper.selectOne(new LambdaQueryWrapper<BizStore>()
                .eq(BizStore::getStoreCode, storeCode)
                .last("LIMIT 1"));
        String groupCode = null;
        if (store != null && store.getGroupId() != null) {
            BizMerchantGroup group = groupMapper.selectById(store.getGroupId());
            groupCode = group != null ? group.getGroupCode() : null;
        }
        for (Map<String, Object> entry : JsonUtils.parseMapList(pricing.getBlockList())) {
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
        entity.setAlgoCode(generateCode());
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

    /** 生成算法编码: ALG + 5位序号（忽略种子数据的非数字后缀） */
    private String generateCode() {
        List<AdAlgorithm> all = algorithmMapper.selectList(
                new LambdaQueryWrapper<AdAlgorithm>().select(AdAlgorithm::getAlgoCode));
        int maxSeq = 0;
        for (AdAlgorithm algo : all) {
            if (!StringUtils.hasText(algo.getAlgoCode())) {
                continue;
            }
            Matcher matcher = CODE_SEQ.matcher(algo.getAlgoCode());
            if (matcher.find()) {
                try {
                    maxSeq = Math.max(maxSeq, Integer.parseInt(matcher.group(1)));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return String.format("ALG%05d", maxSeq + 1);
    }
}

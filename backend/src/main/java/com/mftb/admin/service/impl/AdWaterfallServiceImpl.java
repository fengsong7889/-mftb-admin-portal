package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdWaterfallRequest;
import com.mftb.admin.dto.AdWaterfallVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdWaterfall;
import com.mftb.admin.entity.AdWaterfallSlot;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdWaterfallMapper;
import com.mftb.admin.mapper.AdWaterfallSlotMapper;
import com.mftb.admin.service.AdWaterfallService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 瀑布流策略服务实现
 * 规则: 一条配置可配置多个坑位, 一个坑位只能展示一种算法,
 *       未配置坑位由 APP 端读取自然流量兜底算法(naturalAlgoId)的数据
 */
@Service
@RequiredArgsConstructor
public class AdWaterfallServiceImpl implements AdWaterfallService {

    private final AdWaterfallMapper waterfallMapper;
    private final AdWaterfallSlotMapper slotMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AdWaterfallVO> page(long page, long size, Long id, String strategyName,
                                          String brand, Integer status, Long algoId) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdWaterfall> wrapper = new LambdaQueryWrapper<>();
        if (id != null) wrapper.eq(AdWaterfall::getId, id);
        if (StringUtils.hasText(strategyName)) wrapper.like(AdWaterfall::getStrategyName, strategyName);
        if (StringUtils.hasText(brand)) wrapper.eq(AdWaterfall::getBrand, brand);
        if (status != null) wrapper.eq(AdWaterfall::getStatus, status);

        // 按算法过滤: 先查包含该算法的策略ID集合
        if (algoId != null) {
            List<Long> waterfallIds = slotMapper.selectList(
                            new LambdaQueryWrapper<AdWaterfallSlot>()
                                    .eq(AdWaterfallSlot::getAlgoId, algoId))
                    .stream()
                    .map(AdWaterfallSlot::getWaterfallId)
                    .distinct()
                    .toList();
            if (waterfallIds.isEmpty()) {
                return new PageResult<>(Collections.emptyList(), 0L);
            }
            wrapper.in(AdWaterfall::getId, waterfallIds);
        }
        wrapper.orderByDesc(AdWaterfall::getId);

        Page<AdWaterfall> result = waterfallMapper.selectPage(new Page<>(page, size), wrapper);
        // 列表页仅展示主信息 + 坑位数概况, 坑位明细在详情接口加载
        List<AdWaterfallVO> records = result.getRecords().stream()
                .map(AdWaterfallVO::from)
                .toList();
        fillSlotSummary(records);
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public AdWaterfallVO detail(Long id) {
        return toVO(require(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdWaterfallVO create(AdWaterfallRequest request) {
        Map<Long, AdAlgorithm> algorithms = validateSlots(request);

        AdWaterfall entity = new AdWaterfall();
        applyRequest(entity, request, algorithms);
        if (entity.getStatus() == null) {
            entity.setStatus(1);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        waterfallMapper.insert(entity);

        saveSlots(entity.getId(), request, algorithms);
        return detail(entity.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdWaterfallVO update(Long id, AdWaterfallRequest request) {
        AdWaterfall entity = require(id);
        Map<Long, AdAlgorithm> algorithms = validateSlots(request);
        applyRequest(entity, request, algorithms);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        waterfallMapper.updateById(entity);

        // 坑位明细整体替换：旧明细逻辑删除后写入新明细
        slotMapper.delete(new LambdaQueryWrapper<AdWaterfallSlot>()
                .eq(AdWaterfallSlot::getWaterfallId, id));
        saveSlots(id, request, algorithms);
        return detail(id);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        AdWaterfall entity = require(id);
        entity.setStatus(status);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        waterfallMapper.updateById(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        require(id);
        waterfallMapper.deleteById(id);
        slotMapper.delete(new LambdaQueryWrapper<AdWaterfallSlot>()
                .eq(AdWaterfallSlot::getWaterfallId, id));
    }

    /* ==================== 内部方法 ==================== */

    private AdWaterfall require(Long id) {
        AdWaterfall entity = waterfallMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("瀑布流策略不存在");
        }
        return entity;
    }

    /** 校验坑位配置：坑位序号不重复、算法存在；返回涉及算法映射 */
    private Map<Long, AdAlgorithm> validateSlots(AdWaterfallRequest request) {
        List<AdWaterfallRequest.SlotItem> slots = request.getSlots() == null
                ? Collections.emptyList() : request.getSlots();

        Set<Long> algoIds = new HashSet<>();
        Set<Integer> positions = new HashSet<>();
        for (AdWaterfallRequest.SlotItem slot : slots) {
            if (slot.getSlotPosition() == null || slot.getSlotPosition() < 1) {
                throw new BusinessException("坑位序号必须为正整数");
            }
            if (!positions.add(slot.getSlotPosition())) {
                throw new BusinessException(slot.getSlotPosition() + "号位配置重复，一个坑位只能展示一种算法");
            }
            algoIds.add(slot.getAlgoId());
        }
        if (request.getNaturalAlgoId() != null) {
            algoIds.add(request.getNaturalAlgoId());
        }
        if (algoIds.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<Long, AdAlgorithm> algorithms = algorithmMapper.selectBatchIds(algoIds).stream()
                .collect(Collectors.toMap(AdAlgorithm::getId, Function.identity()));
        for (Long algoId : algoIds) {
            if (!algorithms.containsKey(algoId)) {
                throw new BusinessException("算法不存在: " + algoId);
            }
        }
        return algorithms;
    }

    private void applyRequest(AdWaterfall entity, AdWaterfallRequest request, Map<Long, AdAlgorithm> algorithms) {
        entity.setStrategyName(request.getStrategyName());
        entity.setBrand(request.getBrand());
        entity.setNaturalAlgoId(request.getNaturalAlgoId());
        entity.setNaturalAlgoName(request.getNaturalAlgoId() == null ? null
                : algorithms.get(request.getNaturalAlgoId()).getAlgoName());
        entity.setFilterDislike(request.getFilterDislike() == null ? 2 : request.getFilterDislike());
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
    }

    private void saveSlots(Long waterfallId, AdWaterfallRequest request, Map<Long, AdAlgorithm> algorithms) {
        List<AdWaterfallRequest.SlotItem> slots = request.getSlots();
        if (slots == null || slots.isEmpty()) {
            return;
        }
        for (AdWaterfallRequest.SlotItem slot : slots) {
            AdAlgorithm algorithm = algorithms.get(slot.getAlgoId());
            AdWaterfallSlot entity = new AdWaterfallSlot();
            entity.setWaterfallId(waterfallId);
            entity.setSlotPosition(slot.getSlotPosition());
            entity.setAlgoId(algorithm.getId());
            entity.setAlgoName(algorithm.getAlgoName());
            entity.setAlgoType(algorithm.getAlgoType());
            entity.setStatus(slot.getStatus() == null ? 1 : slot.getStatus());
            entity.setDeleted(0);
            slotMapper.insert(entity);
        }
    }

    /** 列表页补充坑位概况（已配置坑位数，便于列表展示） */
    private void fillSlotSummary(List<AdWaterfallVO> records) {
        if (records.isEmpty()) {
            return;
        }
        List<Long> ids = records.stream().map(AdWaterfallVO::getId).toList();
        List<AdWaterfallSlot> slots = slotMapper.selectList(
                new LambdaQueryWrapper<AdWaterfallSlot>().in(AdWaterfallSlot::getWaterfallId, ids));
        Map<Long, List<AdWaterfallSlot>> grouped = slots.stream()
                .collect(Collectors.groupingBy(AdWaterfallSlot::getWaterfallId));
        for (AdWaterfallVO vo : records) {
            for (AdWaterfallSlot slot : grouped.getOrDefault(vo.getId(), Collections.emptyList())) {
                vo.getSlots().add(toSlotItem(slot));
            }
        }
    }

    private AdWaterfallVO toVO(AdWaterfall entity) {
        AdWaterfallVO vo = AdWaterfallVO.from(entity);
        List<AdWaterfallSlot> slots = slotMapper.selectList(
                new LambdaQueryWrapper<AdWaterfallSlot>()
                        .eq(AdWaterfallSlot::getWaterfallId, entity.getId())
                        .orderByAsc(AdWaterfallSlot::getSlotPosition));
        List<AdWaterfallVO.SlotItem> items = new ArrayList<>(slots.size());
        for (AdWaterfallSlot slot : slots) {
            items.add(toSlotItem(slot));
        }
        vo.setSlots(items);
        return vo;
    }

    private AdWaterfallVO.SlotItem toSlotItem(AdWaterfallSlot slot) {
        AdWaterfallVO.SlotItem item = new AdWaterfallVO.SlotItem();
        item.setId(slot.getId());
        item.setSlotPosition(slot.getSlotPosition());
        item.setAlgoId(slot.getAlgoId());
        item.setAlgoName(slot.getAlgoName());
        item.setAlgoType(slot.getAlgoType());
        item.setStatus(slot.getStatus());
        return item;
    }
}

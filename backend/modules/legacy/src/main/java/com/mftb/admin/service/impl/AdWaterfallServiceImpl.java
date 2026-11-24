package com.mftb.admin.service.impl;

import com.mftb.admin.service.support.AdStarAlgorithmParams;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.mftb.admin.service.AdWaterfallRecommendationService;
import com.mftb.admin.service.AdWaterfallService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 瀑布流策略服务实现
 * 规则: 一条配置可配置多个坑位, 一个坑位只能展示一种算法,
 *       未配置坑位由 APP 端读取自然流量兜底算法(naturalAlgoId)的数据;
 *       团购到店额外持久化展示维度/内容来源/类目兜底/固定内容坑位，
 *       商品维度只能绑定商品类无敌星星算法并以商品类目兜底。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdWaterfallServiceImpl implements AdWaterfallService {

    /** 业务线: 1=外卖到家 2=团购到店 */
    private static final int BUSINESS_DELIVERY = 1;
    private static final int BUSINESS_GROUP_BUY = 2;
    /** 展示维度: 1=门店 2=商品 */
    private static final int CONTENT_STORE = 1;
    private static final int CONTENT_PRODUCT = 2;
    private static final Set<String> DISPLAY_MODES = Set.of("algorithm", "category", "custom");
    private static final Set<String> SORT_MODES = Set.of("score", "sales", "distance", "random");
    private static final Set<String> DELIVERY_BIZ_CHANNELS = Set.of("food", "supermarket");
    private static final int MAX_SLOT_POSITION = 500;
    private static final int MAX_FALLBACK_CATEGORIES = 50;
    private static final int MAX_ID_LENGTH = 64;
    private static final int MAX_NAME_LENGTH = 128;

    private static final ObjectMapper JSON = new ObjectMapper();


    private final AdWaterfallMapper waterfallMapper;
    private final AdWaterfallSlotMapper slotMapper;
    private final AdAlgorithmMapper algorithmMapper;
    private final AdWaterfallRecommendationService recommendationService;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    @Override
    public PageResult<AdWaterfallVO> page(long page, long size, Long id, String strategyCode,
                                          String strategyName, String brand, Integer status, String algoId,
                                          Integer businessType) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        LambdaQueryWrapper<AdWaterfall> wrapper = new LambdaQueryWrapper<>();
        if (id != null) wrapper.eq(AdWaterfall::getId, id);
        if (StringUtils.hasText(strategyCode)) wrapper.like(AdWaterfall::getStrategyCode, strategyCode);
        if (StringUtils.hasText(strategyName)) wrapper.like(AdWaterfall::getStrategyName, strategyName);
        if (StringUtils.hasText(brand)) wrapper.eq(AdWaterfall::getBrand, brand);
        if (status != null) wrapper.eq(AdWaterfall::getStatus, status);
        // 业务线在 SQL 分页前过滤；存量记录迁移后 business_type 默认 1=外卖，不会泄进团购 Tab。
        if (businessType != null) wrapper.eq(AdWaterfall::getBusinessType, businessType);

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
                .map(entity -> fillContent(AdWaterfallVO.from(entity), entity))
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
        Map<String, AdAlgorithm> algorithms = validateSlots(request);

        AdWaterfall entity = new AdWaterfall();
        entity.setStrategyCode(bizSeqService.next(BizSeqService.RULE_WATERFALL));
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
        Map<String, AdAlgorithm> algorithms = validateSlots(request);
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
            throw new BusinessException("非法的服務狀態: " + status);
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
        // 场景绑定随瀑布流同事务清理，避免留下指向不存在瀑布流的孤儿绑定
        recommendationService.deleteByWaterfall(id);
    }

    /* ==================== 内部方法 ==================== */

    private AdWaterfall require(Long id) {
        AdWaterfall entity = waterfallMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("瀑布流策略不存在");
        }
        return entity;
    }

    /** 校验坑位配置：坑位序号不重复、算法存在、展示维度与算法匹配；返回涉及算法映射（按 algoCode 索引）。
     *  同时包含 naturalAlgoId（如有），避免后续重复查询。 */
    private Map<String, AdAlgorithm> validateSlots(AdWaterfallRequest request) {
        int businessType = normalizeBusinessType(request.getBusinessType());
        int contentType = normalizeContentType(request.getContentType(), businessType);
        String displayMode = normalizeDisplayMode(request, businessType, contentType);
        validateConfiguration(request, businessType, contentType, displayMode);

        List<AdWaterfallRequest.SlotItem> slots = request.getSlots() == null
                ? Collections.emptyList() : request.getSlots();
        if (slots.size() > MAX_SLOT_POSITION) {
            throw new BusinessException(422, "坑位數量超過上限 " + MAX_SLOT_POSITION);
        }

        Set<String> algoCodes = new HashSet<>();
        Set<Integer> positions = new HashSet<>();
        for (AdWaterfallRequest.SlotItem slot : slots) {
            if (slot.getSlotPosition() == null || slot.getSlotPosition() < 1) {
                throw new BusinessException("坑位序號必須為正整數");
            }
            if (!positions.add(slot.getSlotPosition())) {
                throw new BusinessException(slot.getSlotPosition() + "号位配置重复，一个坑位只能展示一种算法");
            }
            algoCodes.add(slot.getAlgoId());
        }
        // 将自然流量兜底算法也纳入查询范围，避免 applyRequest 中重复查库
        if (request.getNaturalAlgoId() != null) {
            algoCodes.add(request.getNaturalAlgoId());
        }
        if (algoCodes.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, AdAlgorithm> algorithms = algorithmMapper.selectList(
                new LambdaQueryWrapper<AdAlgorithm>().in(AdAlgorithm::getAlgoCode, algoCodes)
        ).stream().collect(Collectors.toMap(AdAlgorithm::getAlgoCode, Function.identity()));
        // 仅校验坑位引用的算法必须存在（naturalAlgoId 可选，不在坑位中不强制校验）
        Set<String> slotAlgoCodes = slots.stream().map(AdWaterfallRequest.SlotItem::getAlgoId).collect(Collectors.toSet());
        for (String algoCode : slotAlgoCodes) {
            if (!algorithms.containsKey(algoCode)) {
                throw new BusinessException("算法不存在: " + algoCode);
            }
        }
        if (businessType == BUSINESS_GROUP_BUY) {
            // 团购：坑位算法按展示维度裁决（商品维度只能绑商品星星，门店维度拒绝商品星星）；
            // 自然兜底仅门店维度可用且必须是门店兼容算法。
            for (String algoCode : slotAlgoCodes) {
                AdStarAlgorithmParams.requireWaterfallDimension(algorithms.get(algoCode), contentType);
            }
            AdAlgorithm natural = algorithms.get(request.getNaturalAlgoId());
            if (natural != null) {
                AdStarAlgorithmParams.requireStoreCompatible(natural);
            }
        } else {
            // 外卖：保持旧口径——坑位与自然兜底都不接受商品协议。
            algorithms.values().forEach(AdStarAlgorithmParams::requireStoreCompatible);
        }
        return algorithms;
    }

    /* ==================== 团购维度与内容配置校验（服务端镜像前端口径，前端校验不是安全边界） ==================== */

    private static int normalizeBusinessType(Integer value) {
        if (value == null) return BUSINESS_DELIVERY;
        if (value != BUSINESS_DELIVERY && value != BUSINESS_GROUP_BUY) {
            throw new BusinessException(422, "非法的業務線: " + value);
        }
        return value;
    }

    private static int normalizeContentType(Integer value, int businessType) {
        int contentType = value == null ? CONTENT_STORE : value;
        if (contentType != CONTENT_STORE && contentType != CONTENT_PRODUCT) {
            throw new BusinessException(422, "非法的展示維度: " + value);
        }
        if (contentType == CONTENT_PRODUCT && businessType != BUSINESS_GROUP_BUY) {
            throw new BusinessException(422, "外賣到家不支持商品展示維度");
        }
        return contentType;
    }

    /** 团购旧记录未保存模式时沿用类目模式（与前端 getDisplayCategoryMode 归一边齐）；外卖不强制。 */
    private static String normalizeDisplayMode(AdWaterfallRequest request, int businessType, int contentType) {
        String mode = StringUtils.hasText(request.getDisplayCategoryMode())
                ? request.getDisplayCategoryMode().trim().toLowerCase(Locale.ROOT) : null;
        if (mode != null && !DISPLAY_MODES.contains(mode)) {
            throw new BusinessException(422, "非法的展示類目來源: " + mode);
        }
        if (mode == null && businessType == BUSINESS_GROUP_BUY) {
            return contentType == CONTENT_PRODUCT ? "algorithm" : "category";
        }
        return mode;
    }

    private void validateConfiguration(AdWaterfallRequest request, int businessType, int contentType, String displayMode) {
        if (request.getLayoutColumns() != null && request.getLayoutColumns() != 1 && request.getLayoutColumns() != 2) {
            throw new BusinessException(422, "非法的展示佈局: " + request.getLayoutColumns());
        }
        if (StringUtils.hasText(request.getSortMode())
                && !SORT_MODES.contains(request.getSortMode().trim().toLowerCase(Locale.ROOT))) {
            throw new BusinessException(422, "非法的候選排序: " + request.getSortMode());
        }
        if (StringUtils.hasText(request.getBizChannel())) {
            String channel = request.getBizChannel().trim();
            boolean legal = businessType == BUSINESS_GROUP_BUY
                    ? "groupBuy".equals(channel)
                    : DELIVERY_BIZ_CHANNELS.contains(channel);
            if (!legal) throw new BusinessException(422, "非法的業務頻道: " + channel);
        }
        if (businessType != BUSINESS_GROUP_BUY) return;

        List<AdWaterfallRequest.SlotItem> slots = request.getSlots() == null ? List.of() : request.getSlots();
        List<String> fallbackCategories = normalizeFallbackCategories(request.getFallbackCategoryIds());
        List<AdWaterfallRequest.FixedSlotItem> fixedSlots = validateFixedSlots(request.getFixedSlots());
        boolean hasEnabledFixed = fixedSlots.stream().anyMatch(item -> item.getStatus() == null || item.getStatus() == 1);
        switch (displayMode) {
            case "algorithm" -> {
                if (contentType == CONTENT_PRODUCT) {
                    // 商品维度没有门店型自然流量可兜：禁自然兜底，必须配商品类目兜底。
                    if (StringUtils.hasText(request.getNaturalAlgoId())) {
                        throw new BusinessException(422, "商品維度不支持自然流量兜底，請改用商品類目兜底");
                    }
                    if (fallbackCategories.isEmpty()) {
                        throw new BusinessException(422, "商品維度算法提供模式必須配置商品類目兜底");
                    }
                }
            }
            case "category" -> {
                if (!slots.isEmpty()) throw new BusinessException(422, "類目模式不能配置算法坑位");
                if (fallbackCategories.isEmpty()) throw new BusinessException(422, "類目模式必須至少選擇一個類目");
            }
            case "custom" -> {
                if (!slots.isEmpty()) throw new BusinessException(422, "自定義模式不能配置算法坑位");
                if (!fallbackCategories.isEmpty()) throw new BusinessException(422, "自定義模式不支持類目兜底");
                if (fixedSlots.isEmpty() || !hasEnabledFixed) {
                    throw new BusinessException(422, "自定義模式必須至少配置一個啟用的固定展示內容");
                }
            }
            default -> throw new BusinessException(422, "非法的展示類目來源: " + displayMode);
        }
    }

    /** 类目兜底 ID 归一：去空去重、限长限数；返回规范化列表供校验与落库。 */
    private static List<String> normalizeFallbackCategories(List<String> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        Set<String> normalized = new LinkedHashSet<>();
        for (String value : raw) {
            String id = value == null ? "" : value.trim();
            if (id.isEmpty()) continue;
            if (id.length() > MAX_ID_LENGTH) throw new BusinessException(422, "類目編碼過長: " + id.substring(0, MAX_ID_LENGTH) + "...");
            normalized.add(id);
        }
        if (normalized.size() > MAX_FALLBACK_CATEGORIES) {
            throw new BusinessException(422, "類目兜底數量超過上限 " + MAX_FALLBACK_CATEGORIES);
        }
        return List.copyOf(normalized);
    }

    /** 固定展示内容坑位校验：序号正整数且列表内唯一、编码/名称限长、库存非负、状态枚举。 */
    private static List<AdWaterfallRequest.FixedSlotItem> validateFixedSlots(List<AdWaterfallRequest.FixedSlotItem> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        if (raw.size() > MAX_SLOT_POSITION) throw new BusinessException(422, "固定內容坑位數量超過上限 " + MAX_SLOT_POSITION);
        Set<Integer> positions = new HashSet<>();
        for (AdWaterfallRequest.FixedSlotItem item : raw) {
            if (item.getSlotPosition() == null || item.getSlotPosition() < 1 || item.getSlotPosition() > MAX_SLOT_POSITION) {
                throw new BusinessException(422, "固定內容坑位序號必須為 1–" + MAX_SLOT_POSITION + " 的整數");
            }
            if (!positions.add(item.getSlotPosition())) {
                throw new BusinessException(422, item.getSlotPosition() + "号位固定內容配置重複");
            }
            if (item.getItemId() == null || item.getItemId().isBlank() || item.getItemId().trim().length() > MAX_ID_LENGTH) {
                throw new BusinessException(422, "固定內容編碼不能為空且不得超過" + MAX_ID_LENGTH + "字符");
            }
            if (item.getItemName() == null || item.getItemName().isBlank() || item.getItemName().trim().length() > MAX_NAME_LENGTH) {
                throw new BusinessException(422, "固定內容名稱不能為空且不得超過" + MAX_NAME_LENGTH + "字符");
            }
            if (item.getCategoryId() != null && item.getCategoryId().length() > MAX_ID_LENGTH) {
                throw new BusinessException(422, "分類編碼過長");
            }
            if (item.getCategoryName() != null && item.getCategoryName().length() > MAX_NAME_LENGTH) {
                throw new BusinessException(422, "分類名稱過長");
            }
            if (item.getStock() != null && (item.getStock() < 0 || item.getStock() > 1_000_000_000)) {
                throw new BusinessException(422, "固定內容庫存快照取值非法: " + item.getStock());
            }
            if (item.getStatus() != null && item.getStatus() != 1 && item.getStatus() != 2) {
                throw new BusinessException(422, "非法的坑位狀態: " + item.getStatus());
            }
        }
        return raw;
    }

    private void applyRequest(AdWaterfall entity, AdWaterfallRequest request, Map<String, AdAlgorithm> algorithms) {
        entity.setStrategyName(request.getStrategyName());
        entity.setBrand(request.getBrand());
        entity.setNaturalAlgoId(request.getNaturalAlgoId());
        // naturalAlgoId 现为算法编码，直接从已查询的 algorithms 映射中取名称（无需额外查库）
        if (request.getNaturalAlgoId() != null) {
            AdAlgorithm naturalAlgo = algorithms.get(request.getNaturalAlgoId());
            entity.setNaturalAlgoName(naturalAlgo != null ? naturalAlgo.getAlgoName() : null);
        } else {
            entity.setNaturalAlgoName(null);
        }
        entity.setFilterDislike(request.getFilterDislike() == null ? 2 : request.getFilterDislike());
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setRemark(request.getRemark());
        // 团购维度/内容配置：校验已在 validateSlots 完成，这里只落归一后的值。
        int businessType = normalizeBusinessType(request.getBusinessType());
        int contentType = normalizeContentType(request.getContentType(), businessType);
        entity.setBusinessType(businessType);
        entity.setContentType(contentType);
        entity.setDisplayCategoryMode(normalizeDisplayMode(request, businessType, contentType));
        entity.setLayoutColumns(request.getLayoutColumns() == null ? 1 : request.getLayoutColumns());
        entity.setBizChannel(StringUtils.hasText(request.getBizChannel()) ? request.getBizChannel().trim() : null);
        entity.setSortMode(StringUtils.hasText(request.getSortMode())
                ? request.getSortMode().trim().toLowerCase(Locale.ROOT) : null);
        List<String> fallbackCategories = normalizeFallbackCategories(request.getFallbackCategoryIds());
        entity.setFallbackCategoryIds(fallbackCategories.isEmpty() ? null : writeJson(fallbackCategories));
        List<AdWaterfallRequest.FixedSlotItem> fixedSlots = validateFixedSlots(request.getFixedSlots());
        entity.setFixedSlots(fixedSlots.isEmpty() ? null : writeJson(fixedSlots));
    }

    /** 坑位明细的落库 JSON 直接存请求字段名，VO 读取时同构反序列化，避免两套映射漂移。 */
    private static String writeJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception ex) {
            throw new BusinessException(422, "內容配置序列化失敗");
        }
    }

    /** 历史脏数据不得把列表/详情打成 500：解析失败降级为空配置并留 warn，写入侧已按白名单校验。 */
    private AdWaterfallVO fillContent(AdWaterfallVO vo, AdWaterfall entity) {
        if (StringUtils.hasText(entity.getFallbackCategoryIds())) {
            try {
                vo.setFallbackCategoryIds(JSON.readValue(entity.getFallbackCategoryIds(), new TypeReference<List<String>>() { }));
            } catch (Exception ex) {
                log.warn("瀑布流类目兜底配置解析失败: waterfallId={}", entity.getId());
            }
        }
        if (StringUtils.hasText(entity.getFixedSlots())) {
            try {
                vo.setFixedSlots(JSON.readValue(entity.getFixedSlots(), new TypeReference<List<AdWaterfallVO.FixedSlotItem>>() { }));
            } catch (Exception ex) {
                log.warn("瀑布流固定内容坑位解析失败: waterfallId={}", entity.getId());
            }
        }
        return vo;
    }

    private void saveSlots(Long waterfallId, AdWaterfallRequest request, Map<String, AdAlgorithm> algorithms) {
        List<AdWaterfallRequest.SlotItem> slots = request.getSlots();
        if (slots == null || slots.isEmpty()) {
            return;
        }
        for (AdWaterfallRequest.SlotItem slot : slots) {
            AdAlgorithm algorithm = algorithms.get(slot.getAlgoId());
            AdWaterfallSlot entity = new AdWaterfallSlot();
            entity.setWaterfallId(waterfallId);
            entity.setSlotPosition(slot.getSlotPosition());
            entity.setAlgoId(algorithm.getAlgoCode());
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
        AdWaterfallVO vo = fillContent(AdWaterfallVO.from(entity), entity);
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

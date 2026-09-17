package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamInboundCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamLocation;
import com.mftb.admin.entity.EamModel;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.mapper.EamModelMapper;
import com.mftb.admin.entity.EamInboundBatch;
import com.mftb.admin.entity.EamInboundBatchItem;
import com.mftb.admin.entity.EamPurchaseOrder;
import com.mftb.admin.entity.EamPurchaseOrderItem;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamInboundBatchItemMapper;
import com.mftb.admin.mapper.EamInboundBatchMapper;
import com.mftb.admin.mapper.EamPurchaseOrderItemMapper;
import com.mftb.admin.mapper.EamPurchaseOrderMapper;
import com.mftb.admin.service.EamAssetService;
import com.mftb.admin.service.EamInboundService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 验收入库服务实现
 * <p>
 * P0-3: 验收入库 → 生成资产编号 + 写入资产台账
 * P0-4: 验收入库 → 回写采购订单 status / acceptedQty / receivedQty
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamInboundServiceImpl implements EamInboundService {

    private final EamInboundBatchMapper batchMapper;
    private final EamInboundBatchItemMapper batchItemMapper;
    private final EamPurchaseOrderMapper orderMapper;
    private final EamPurchaseOrderItemMapper orderItemMapper;
    private final EamAssetMapper assetMapper;
    private final EamLocationMapper locationMapper;
    private final EamModelMapper modelMapper;
    private final EamAssetService assetService;

    private static final String PASS = "pass";
    private static final Set<String> DISPOSITIONS = Set.of(PASS, "return", "exchange", "concession");
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    /* ==================== 分页查询 ==================== */

    @Override
    public PageResult<Map<String, Object>> pageBatches(int page, int size) {
        Page<EamInboundBatch> pageObj = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        Page<EamInboundBatch> result = batchMapper.selectPage(pageObj,
                new LambdaQueryWrapper<EamInboundBatch>().orderByDesc(EamInboundBatch::getCreatedAt));

        List<Map<String, Object>> records = result.getRecords().stream()
                .map(this::batchToMap)
                .collect(Collectors.toList());
        return new PageResult<>(records, result.getTotal());
    }

    /* ==================== 批次详情 ==================== */

    @Override
    public Map<String, Object> getBatchDetail(long batchId) {
        EamInboundBatch batch = batchMapper.selectById(batchId);
        if (batch == null) throw new BusinessException("入庫批次不存在");

        Map<String, Object> map = batchToMap(batch);

        // 查询明细（不在 SQL 层 ORDER BY：SELECT * 含 photos/accessories 等大 TEXT/JSON 列，
        // filesort 大行会触发 MySQL error 1038 Out of sort memory；改为内存排序）
        List<EamInboundBatchItem> items = batchItemMapper.selectList(
                new LambdaQueryWrapper<EamInboundBatchItem>()
                        .eq(EamInboundBatchItem::getBatchId, batchId));
        items.sort(java.util.Comparator.comparing(
                it -> it.getSortOrder() == null ? 0 : it.getSortOrder()));

        List<Map<String, Object>> itemMaps = items.stream().map(this::itemToMap).toList();
        map.put("items", itemMaps);

        return map;
    }

    /* ==================== 创建入库批次（核心） ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(EamInboundCreateDTO dto) {
        Long poIdObj = dto.getPoId();
        if (poIdObj == null || poIdObj <= 0) throw new BusinessException("缺少採購訂單 ID");
        long poId = poIdObj;

        EamPurchaseOrder order = orderMapper.selectForUpdate(poId);
        if (order == null) throw new BusinessException("採購訂單不存在");
        if (!"completed".equals(order.getExecStatus())) throw new BusinessException("採購完成後才可驗收入庫");
        if ("received".equals(order.getStatus())) throw new BusinessException("訂單已全部驗收入庫");

        String operator = operatorResolver.currentOperatorName();
        String inboundDate = validateDate(dto.getInboundDate(), LocalDate.now().toString());

        List<EamInboundCreateDTO.InboundItem> inboundItems = dto.getItems();
        if (inboundItems == null || inboundItems.isEmpty()) {
            throw new BusinessException("入庫明細不能為空");
        }

        // 查询订单明细
        List<EamPurchaseOrderItem> orderItems = orderItemMapper.selectList(
                new LambdaQueryWrapper<EamPurchaseOrderItem>()
                        .eq(EamPurchaseOrderItem::getOrderId, poId));
        Map<Long, EamPurchaseOrderItem> orderItemMap = orderItems.stream()
                .collect(Collectors.toMap(EamPurchaseOrderItem::getId, it -> it));
        Map<Long, Long> submittedQty = new HashMap<>();
        Map<Long, Integer> receivedInBatch = new HashMap<>();
        Map<Long, Integer> returnedInBatch = new HashMap<>();
        Map<Long, Integer> exchangedInBatch = new HashMap<>();
        Map<Long, EamLocation> locations = new HashMap<>();
        Map<Long, EamModel> models = new HashMap<>();

        // 校验入库数量不超过订单剩余未验收数量
        for (EamInboundCreateDTO.InboundItem item : inboundItems) {
            if (item == null || item.getQty() == null || item.getQty() <= 0) {
                throw new BusinessException("驗收數量必須為正整數");
            }
            EamPurchaseOrderItem orderItem = resolveOrderItem(item, orderItems, orderItemMap);
            item.setOrderItemId(orderItem.getId());
            item.setModelId(orderItem.getModelId());
            item.setModelName(orderItem.getModelName());
            item.setInboundDate(validateDate(item.getInboundDate(), inboundDate));
            String disposition = item.getDisposition() == null || item.getDisposition().isBlank()
                    ? PASS : item.getDisposition();
            if (!DISPOSITIONS.contains(disposition)) throw new BusinessException("無效的驗收處置方式");
            item.setDisposition(disposition);
            long submitted = submittedQty.merge(orderItem.getId(), item.getQty().longValue(), Long::sum);
            int remaining = Objects.requireNonNullElse(orderItem.getQty(), 0)
                    - Objects.requireNonNullElse(orderItem.getReceivedQty(), 0)
                    - Objects.requireNonNullElse(orderItem.getReturnedQty(), 0);
            if (submitted > remaining) throw new BusinessException(orderItem.getModelName() + " 驗收總數超出訂單剩餘數量");
            if (PASS.equals(disposition)) {
                if (item.getLocationId() == null || item.getLocationId() <= 0) throw new BusinessException("請選擇存放位置");
                EamLocation location = locations.computeIfAbsent(item.getLocationId(), locationMapper::selectById);
                if (location == null) throw new BusinessException("存放位置不存在");
                item.setLocationName(location.getName());
                EamModel model = models.computeIfAbsent(item.getModelId(), modelMapper::selectById);
                if (model == null) throw new BusinessException("資產型號不存在");
                receivedInBatch.merge(orderItem.getId(), item.getQty(), Integer::sum);
            } else {
                item.setLocationId(null);
                item.setLocationName(null);
            }
        }

        // 生成批次编号
        String batchNo = bizSeqService.next(BizSeqService.RULE_EAM_INBOUND_BATCH);

        // 统计计数
        int totalQty = 0;
        int acceptedQty = 0;
        int returnQty = 0;
        int exchangeQty = 0;
        int concessionQty = 0;

        // 展开所有资产并收集待写入列表
        List<EamAsset> assetsToInsert = new ArrayList<>();
        List<EamInboundBatchItem> batchItemsToInsert = new ArrayList<>();
        int sort = 0;

        // 先插入批次（统计计数暂置 0，循环结束后回写），以便在明细循环内即时写入资产并取得 batchId。
        // 关键：资产即时入库后，同事务内后续 generateAssetNo 的 SELECT MAX 能读到本批次已生成编号
        //（read-your-writes），从而避免“同批次多件验收时资产编号重复 → 唯一键冲突 → 整事务回滚”的缺陷。
        EamInboundBatch batch = new EamInboundBatch();
        batch.setBatchNo(batchNo);
        batch.setPoId(poId);
        batch.setPoNo(order.getPoNo());
        batch.setBrand(order.getBrand());
        batch.setInboundDate(inboundDate);
        batch.setOperator(operator);
        batch.setTotalQty(0);
        batch.setAcceptedQty(0);
        batch.setPendingQty(0);
        batch.setReturnQty(0);
        batch.setExchangeQty(0);
        batch.setConcessionQty(0);
        batch.setGeneratedAssetCount(0);
        batch.setPurchaseReason(order.getRemark());
        batch.setRemark(Objects.toString(dto.getRemark(), ""));
        batch.setUpdatedBy(operator);
        batchMapper.insert(batch);

        for (EamInboundCreateDTO.InboundItem item : inboundItems) {
            long modelId = item.getModelId() == null ? -1L : item.getModelId();
            int qty = item.getQty() == null ? 0 : item.getQty();
            Long locationId = item.getLocationId();
            String locationName = Objects.toString(item.getLocationName(), "");
            String modelName = Objects.toString(item.getModelName(), "");
            String disposition = Objects.toString(item.getDisposition(), ""); // pass / return / exchange / concession

            if (modelId <= 0 || qty <= 0) continue;

            EamPurchaseOrderItem orderItem = orderItemMap.get(item.getOrderItemId());

            // 根据验收结果分类数量
            int accepted = qty;
            int ret = 0;
            int exc = 0;
            int conc = 0;
            if ("return".equals(disposition)) {
                accepted = 0; ret = qty;
            } else if ("exchange".equals(disposition)) {
                accepted = 0; exc = qty;
            } else if ("concession".equals(disposition)) {
                accepted = 0; conc = qty;
            }

            totalQty += qty;
            acceptedQty += accepted;
            returnQty += ret;
            exchangeQty += exc;
            concessionQty += conc;
            // PR-2: 明細級終態/在途累計（退貨終態扣減待驗收；換貨在途標記）
            if (ret > 0) returnedInBatch.merge(orderItem.getId(), ret, Integer::sum);
            if (exc > 0) exchangedInBatch.merge(orderItem.getId(), exc, Integer::sum);

            // 仅验收通过的生成资产编号
            List<String> assetNos = new ArrayList<>();
            if (accepted > 0) {
                for (int i = 0; i < accepted; i++) {
                    String assetNo = assetService.generateAssetNo(
                            order.getBrand(), locationId,
                            orderItem != null ? orderItem.getCategoryCode() : null);
                    assetNos.add(assetNo);

                    EamAsset asset = new EamAsset();
                    asset.setAssetNo(assetNo);
                    asset.setAssetName(modelName);
                    asset.setModelId(modelId);
                    asset.setCompanyBrand(order.getBrand());
                    if (orderItem != null) {
                        asset.setAssetType(orderItem.getCategoryName());
                        asset.setCategoryId(orderItem.getCategoryId());
                        asset.setCategoryCode(orderItem.getCategoryCode());
                        asset.setBrand(orderItem.getBrandName());
                        asset.setBrandId(orderItem.getBrandId());
                        asset.setParams(orderItem.getParams());
                        asset.setPurchaseType(orderItem.getPurchaseType());
                        BigDecimal price = orderItem.getConfirmedPrice() != null
                                ? orderItem.getConfirmedPrice() : orderItem.getPrice();
                        asset.setPurchaseValue(price != null ? price : BigDecimal.ZERO);
                    }
                    asset.setUnit(models.get(modelId).getUnit());
                    asset.setPurchaseDate(item.getInboundDate());
                    // 驗收照片同步寫入資產主圖（images：Data URL 逗號分隔）
                    String images = extractPhotoDataUrls(item.getPhotos());
                    if (!images.isEmpty()) {
                        asset.setImages(images);
                    }
                    asset.setSource("lease".equals(orderItem.getPurchaseType()) ? "lease" : "self");
                    asset.setDepartment(Objects.toString(order.getDepartment(), ""));
                    asset.setLocation(locationName);
                    asset.setLocationId(locationId);
                    asset.setStatus("idle");
                    asset.setHoldType("owned");
                    asset.setOrderId(poId);
                    asset.setRemark("採購訂單 " + order.getPoNo() + " 驗收入庫");
                    asset.setUpdatedBy(operator);
                    // 即時入庫：保證同批次內後續 generateAssetNo 的 SELECT MAX 能讀到已生成編號（read-your-writes），避免重號
                    asset.setBatchId(batch.getId());
                    assetMapper.insert(asset);
                    assetsToInsert.add(asset);
                }
            }

            // 保存批次明细（含验收处置留痕）
            EamInboundBatchItem batchItem = new EamInboundBatchItem();
            batchItem.setOrderItemId(orderItem.getId());
            batchItem.setGroupId(orderItem.getGroupId());
            batchItem.setInboundDate(item.getInboundDate());
            batchItem.setLocationName(item.getLocationName());
            batchItem.setModelId(modelId);
            batchItem.setModelName(modelName);
            batchItem.setQty(qty);
            batchItem.setLocationId(locationId);
            batchItem.setDisposition(disposition.isEmpty() ? "pass" : disposition);
            // PR-3: 換貨明細初始狀態為 pending（等待登記二次發貨）
            if ("exchange".equals(batchItem.getDisposition())) batchItem.setExchangeStatus("pending");
            batchItem.setRejectReason(Objects.toString(item.getRejectReason(), ""));
            // 验收照片 JSON
            if (item.getPhotos() != null) {
                batchItem.setPhotos(JsonUtils.toJson(item.getPhotos()));
            }
            // 配件清單 JSON
            if (item.getAccessories() != null) {
                batchItem.setAccessories(JsonUtils.toJson(item.getAccessories()));
            }
            batchItem.setAssetNos(JsonUtils.toJson(assetNos));
            batchItem.setSortOrder(sort++);
            batchItemsToInsert.add(batchItem);
        }

        // 回寫批次統計（資產已在明細循環內即時入庫）
        batch.setTotalQty(totalQty);
        batch.setAcceptedQty(acceptedQty);
        batch.setPendingQty(totalQty - acceptedQty);
        batch.setReturnQty(returnQty);
        batch.setExchangeQty(exchangeQty);
        batch.setConcessionQty(concessionQty);
        // PR-2: 反規範化實際生成資產數
        batch.setGeneratedAssetCount(assetsToInsert.size());
        batchMapper.updateById(batch);

        // 保存明细
        for (EamInboundBatchItem item : batchItemsToInsert) {
            item.setBatchId(batch.getId());
            batchItemMapper.insert(item);
        }

        // ====== P0-4: 回写采购订单 ======
        // 更新订单明细的 receivedQty
        for (Map.Entry<Long, Integer> entry : receivedInBatch.entrySet()) {
            EamPurchaseOrderItem orderItem = orderItemMap.get(entry.getKey());
            int received = Objects.requireNonNullElse(orderItem.getReceivedQty(), 0) + entry.getValue();
            int affected = orderItemMapper.update(null, new LambdaUpdateWrapper<EamPurchaseOrderItem>()
                    .eq(EamPurchaseOrderItem::getId, entry.getKey())
                    .eq(EamPurchaseOrderItem::getOrderId, poId)
                    .set(EamPurchaseOrderItem::getReceivedQty, received));
            if (affected != 1) throw new BusinessException("訂單明細已變更，請重新載入後驗收");
        }

        // PR-2: 回寫訂單明細 returnedQty / exchangedQty（退貨終態 / 換貨在途）
        for (Map.Entry<Long, Integer> entry : returnedInBatch.entrySet()) {
            EamPurchaseOrderItem orderItem = orderItemMap.get(entry.getKey());
            int returned = Objects.requireNonNullElse(orderItem.getReturnedQty(), 0) + entry.getValue();
            orderItemMapper.update(null, new LambdaUpdateWrapper<EamPurchaseOrderItem>()
                    .eq(EamPurchaseOrderItem::getId, entry.getKey())
                    .eq(EamPurchaseOrderItem::getOrderId, poId)
                    .set(EamPurchaseOrderItem::getReturnedQty, returned));
        }
        for (Map.Entry<Long, Integer> entry : exchangedInBatch.entrySet()) {
            EamPurchaseOrderItem orderItem = orderItemMap.get(entry.getKey());
            int exchanged = Objects.requireNonNullElse(orderItem.getExchangedQty(), 0) + entry.getValue();
            orderItemMapper.update(null, new LambdaUpdateWrapper<EamPurchaseOrderItem>()
                    .eq(EamPurchaseOrderItem::getId, entry.getKey())
                    .eq(EamPurchaseOrderItem::getOrderId, poId)
                    .set(EamPurchaseOrderItem::getExchangedQty, exchanged));
        }

        // 重新查询订单明细计算整体状态
        List<EamPurchaseOrderItem> updatedItems = orderItemMapper.selectList(
                new LambdaQueryWrapper<EamPurchaseOrderItem>()
                        .eq(EamPurchaseOrderItem::getOrderId, poId));

        boolean allReceived = !updatedItems.isEmpty() && updatedItems.stream()
                .allMatch(it -> (it.getReceivedQty() != null ? it.getReceivedQty() : 0)
                        + (it.getReturnedQty() != null ? it.getReturnedQty() : 0) >= it.getQty());
        boolean anyReceived = updatedItems.stream()
                .anyMatch(it -> (it.getReceivedQty() != null ? it.getReceivedQty() : 0) > 0);

        String newStatus;
        if (allReceived) {
            newStatus = "received";
        } else if (anyReceived) {
            newStatus = "partial";
        } else {
            newStatus = "pending";
        }

        // 计算已验收总数
        int totalAccepted = updatedItems.stream()
                .mapToInt(it -> it.getReceivedQty() != null ? it.getReceivedQty() : 0)
                .sum();

        orderMapper.update(null,
                new LambdaUpdateWrapper<EamPurchaseOrder>()
                        .eq(EamPurchaseOrder::getId, poId)
                        .set(EamPurchaseOrder::getStatus, newStatus)
                        .set(EamPurchaseOrder::getAcceptedQty, totalAccepted)
                        .set(EamPurchaseOrder::getReturnQty,
                                (order.getReturnQty() != null ? order.getReturnQty() : 0) + returnQty)
                        .set(EamPurchaseOrder::getExchangeQty,
                                (order.getExchangeQty() != null ? order.getExchangeQty() : 0) + exchangeQty)
                        .set(EamPurchaseOrder::getConcessionQty,
                                (order.getConcessionQty() != null ? order.getConcessionQty() : 0) + concessionQty)
                        .set(EamPurchaseOrder::getUpdatedBy, operator)
                        .set(EamPurchaseOrder::getUpdatedAt, java.time.LocalDateTime.now()));

        log.info("入庫批次已創建: batchNo={}, poId={}, 資產數={}, 訂單狀態→{}",
                batchNo, poId, assetsToInsert.size(), newStatus);

        // 返回批次信息
        Map<String, Object> result = batchToMap(batch);
        result.put("items", batchItemsToInsert.stream().map(this::itemToMap).toList());
        result.put("generatedAssetCount", assetsToInsert.size());
        return result;
    }

    @Override
    public Map<String, Object> registerExchangeShipment(long batchId, long itemId, String trackingNo, String expectedDate) {
        EamInboundBatchItem item = batchItemMapper.selectOne(new LambdaQueryWrapper<EamInboundBatchItem>()
                .eq(EamInboundBatchItem::getId, itemId)
                .eq(EamInboundBatchItem::getBatchId, batchId));
        if (item == null) throw new BusinessException("入庫明細不存在");
        if (!"exchange".equals(item.getDisposition())) throw new BusinessException("僅換貨明細可登記二次發貨");
        if (trackingNo == null || trackingNo.isBlank()) throw new BusinessException("請填寫物流單號");
        batchItemMapper.update(null, new LambdaUpdateWrapper<EamInboundBatchItem>()
                .eq(EamInboundBatchItem::getId, itemId)
                .set(EamInboundBatchItem::getExchangeTrackingNo, trackingNo.trim())
                .set(EamInboundBatchItem::getExchangeExpectedDate,
                        expectedDate == null || expectedDate.isBlank() ? null : expectedDate.trim())
                .set(EamInboundBatchItem::getExchangeStatus, "shipped"));
        log.info("換貨二次發貨已登記: batchId={}, itemId={}, trackingNo={}", batchId, itemId, trackingNo);
        return itemToMap(batchItemMapper.selectById(itemId));
    }

    /* ==================== 內部方法 ==================== */

    /**
     * 提取验收照片 Data URL（逗号分隔），用于写入资产主图 images
     * photos 结构：[{name, dataUrl}]（Object 透传，Jackson 反序列化为 List<Map>）
     */
    private String extractPhotoDataUrls(Object photos) {
        if (!(photos instanceof List<?> list)) return "";
        StringBuilder sb = new StringBuilder();
        for (Object p : list) {
            if (p instanceof Map<?, ?> m) {
                Object dataUrl = m.get("dataUrl");
                if (dataUrl != null && !String.valueOf(dataUrl).isBlank()) {
                    if (sb.length() > 0) sb.append(',');
                    sb.append(dataUrl);
                }
            }
        }
        return sb.toString();
    }

    private EamPurchaseOrderItem resolveOrderItem(EamInboundCreateDTO.InboundItem item,
            List<EamPurchaseOrderItem> items, Map<Long, EamPurchaseOrderItem> byId) {
        EamPurchaseOrderItem match;
        if (item.getOrderItemId() != null) {
            match = byId.get(item.getOrderItemId());
        } else {
            List<EamPurchaseOrderItem> matches = items.stream()
                    .filter(it -> item.getModelId() != null && item.getModelId().equals(it.getModelId())).toList();
            if (matches.size() != 1) throw new BusinessException("請提供唯一的採購訂單明細 ID");
            match = matches.get(0);
        }
        if (match == null || match.getModelId() == null || match.getModelId() <= 0
                || (item.getModelId() != null && !item.getModelId().equals(match.getModelId()))) {
            throw new BusinessException("入庫明細不屬於該訂單或型號不匹配");
        }
        return match;
    }

    private String validateDate(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return LocalDate.parse(value).toString();
        } catch (DateTimeParseException e) {
            throw new BusinessException("驗收日期格式應為 yyyy-MM-dd");
        }
    }

    private Map<String, Object> itemToMap(EamInboundBatchItem it) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", it.getId());
        m.put("orderItemId", it.getOrderItemId());
        m.put("groupId", it.getGroupId());
        m.put("inboundDate", it.getInboundDate());
        m.put("locationName", it.getLocationName());
        m.put("modelId", it.getModelId());
        m.put("modelName", it.getModelName());
        m.put("qty", it.getQty());
        m.put("locationId", it.getLocationId());
        m.put("disposition", it.getDisposition() != null ? it.getDisposition() : PASS);
        m.put("rejectReason", it.getRejectReason());
        m.put("photos", it.getPhotos() != null ? JsonUtils.parseMapList(it.getPhotos()) : List.of());
        m.put("accessories", it.getAccessories() != null ? JsonUtils.parseMapList(it.getAccessories()) : List.of());
        m.put("assetNos", it.getAssetNos() != null ? JsonUtils.parseStringList(it.getAssetNos()) : List.of());
        // PR-3: 換貨二次發貨跟蹤字段
        m.put("exchangeTrackingNo", it.getExchangeTrackingNo());
        m.put("exchangeExpectedDate", it.getExchangeExpectedDate());
        m.put("exchangeStatus", it.getExchangeStatus());
        m.put("followupBatchId", it.getFollowupBatchId());
        return m;
    }

    private Map<String, Object> batchToMap(EamInboundBatch b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("batchNo", b.getBatchNo());
        m.put("poId", b.getPoId());
        m.put("poNo", b.getPoNo());
        m.put("brand", b.getBrand());
        m.put("inboundDate", b.getInboundDate());
        m.put("operator", b.getOperator());
        m.put("totalQty", b.getTotalQty());
        m.put("acceptedQty", b.getAcceptedQty());
        m.put("generatedAssetCount", b.getGeneratedAssetCount() != null ? b.getGeneratedAssetCount() : b.getAcceptedQty());
        m.put("pendingQty", b.getPendingQty());
        m.put("returnQty", b.getReturnQty());
        m.put("exchangeQty", b.getExchangeQty());
        m.put("concessionQty", b.getConcessionQty());
        m.put("purchaseReason", b.getPurchaseReason());
        m.put("remark", b.getRemark());
        m.put("createdAt", b.getCreatedAt() != null ? b.getCreatedAt().toString() : null);
        m.put("updatedBy", b.getUpdatedBy());
        m.put("updatedAt", b.getUpdatedAt() != null ? b.getUpdatedAt().toString() : null);
        return m;
    }
}

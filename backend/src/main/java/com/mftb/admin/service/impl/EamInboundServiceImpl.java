package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamInboundCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamInboundBatch;
import com.mftb.admin.entity.EamInboundBatchItem;
import com.mftb.admin.entity.EamPurchaseOrder;
import com.mftb.admin.entity.EamPurchaseOrderItem;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamInboundBatchItemMapper;
import com.mftb.admin.mapper.EamInboundBatchMapper;
import com.mftb.admin.mapper.EamPurchaseOrderItemMapper;
import com.mftb.admin.mapper.EamPurchaseOrderMapper;
import com.mftb.admin.service.EamInboundService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
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

        // 查询明细
        List<EamInboundBatchItem> items = batchItemMapper.selectList(
                new LambdaQueryWrapper<EamInboundBatchItem>()
                        .eq(EamInboundBatchItem::getBatchId, batchId)
                        .orderByAsc(EamInboundBatchItem::getSortOrder));

        List<Map<String, Object>> itemMaps = items.stream().map(it -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", it.getId());
            m.put("modelId", it.getModelId());
            m.put("modelName", it.getModelName());
            m.put("qty", it.getQty());
            m.put("locationId", it.getLocationId());
            m.put("disposition", it.getDisposition() != null ? it.getDisposition() : "pass");
            m.put("rejectReason", it.getRejectReason());
            m.put("photos", it.getPhotos() != null ? JsonUtils.parseMapList(it.getPhotos()) : List.of());
            m.put("assetNos", it.getAssetNos() != null ? JsonUtils.parseStringList(it.getAssetNos()) : List.of());
            return m;
        }).collect(Collectors.toList());
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

        EamPurchaseOrder order = orderMapper.selectById(poId);
        if (order == null) throw new BusinessException("採購訂單不存在");

        String operator = operatorResolver.currentOperatorName();
        String inboundDate = Objects.toString(dto.getInboundDate(), "");
        if (inboundDate.isEmpty()) {
            inboundDate = java.time.LocalDate.now().toString();
        }

        List<EamInboundCreateDTO.InboundItem> inboundItems = dto.getItems();
        if (inboundItems == null || inboundItems.isEmpty()) {
            throw new BusinessException("入庫明細不能為空");
        }

        // 查询订单明细
        List<EamPurchaseOrderItem> orderItems = orderItemMapper.selectList(
                new LambdaQueryWrapper<EamPurchaseOrderItem>()
                        .eq(EamPurchaseOrderItem::getOrderId, poId));
        Map<Long, EamPurchaseOrderItem> orderItemMap = orderItems.stream()
                .collect(Collectors.toMap(EamPurchaseOrderItem::getModelId, it -> it, (a, b) -> a));

        // 校验入库数量不超过订单剩余未验收数量
        for (EamInboundCreateDTO.InboundItem item : inboundItems) {
            long modelId = item.getModelId() == null ? -1L : item.getModelId();
            int qty = item.getQty() == null ? 0 : item.getQty();
            if (modelId <= 0 || qty <= 0) continue;

            EamPurchaseOrderItem orderItem = orderItemMap.get(modelId);
            if (orderItem == null) {
                throw new BusinessException("入庫型號 " + Objects.toString(item.getModelName(), "") + " 不在訂單明細中");
            }
            int alreadyReceived = orderItem.getReceivedQty() != null ? orderItem.getReceivedQty() : 0;
            if (alreadyReceived + qty > orderItem.getQty()) {
                throw new BusinessException(orderItem.getModelName()
                        + " 入庫數量超出訂單未驗收數量（訂單 " + orderItem.getQty()
                        + "，已驗收 " + alreadyReceived + "）");
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

        for (EamInboundCreateDTO.InboundItem item : inboundItems) {
            long modelId = item.getModelId() == null ? -1L : item.getModelId();
            int qty = item.getQty() == null ? 0 : item.getQty();
            Long locationId = item.getLocationId();
            String locationName = Objects.toString(item.getLocationName(), "");
            String modelName = Objects.toString(item.getModelName(), "");
            String disposition = Objects.toString(item.getDisposition(), ""); // pass / return / exchange / concession

            if (modelId <= 0 || qty <= 0) continue;

            EamPurchaseOrderItem orderItem = orderItemMap.get(modelId);

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

            // 仅验收通过的生成资产编号
            List<String> assetNos = new ArrayList<>();
            if (accepted > 0) {
                for (int i = 0; i < accepted; i++) {
                    String assetNo = bizSeqService.next(BizSeqService.RULE_EAM_ASSET);
                    assetNos.add(assetNo);

                    EamAsset asset = new EamAsset();
                    asset.setAssetNo(assetNo);
                    asset.setAssetName(modelName);
                    asset.setModelId(modelId);
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
                    asset.setPurchaseDate(inboundDate);
                    asset.setSource("self");
                    asset.setLocation(locationName);
                    asset.setLocationId(locationId);
                    asset.setStatus("idle");
                    asset.setHoldType("owned");
                    asset.setOrderId(poId);
                    asset.setRemark("採購訂單 " + order.getPoNo() + " 驗收入庫");
                    asset.setUpdatedBy(operator);
                    assetsToInsert.add(asset);
                }
            }

            // 保存批次明细（含验收处置留痕）
            EamInboundBatchItem batchItem = new EamInboundBatchItem();
            batchItem.setModelId(modelId);
            batchItem.setModelName(modelName);
            batchItem.setQty(qty);
            batchItem.setLocationId(locationId);
            batchItem.setDisposition(disposition.isEmpty() ? "pass" : disposition);
            batchItem.setRejectReason(Objects.toString(item.getRejectReason(), ""));
            // 验收照片 JSON
            if (item.getPhotos() != null) {
                batchItem.setPhotos(JsonUtils.toJson(item.getPhotos()));
            }
            batchItem.setAssetNos(JsonUtils.toJson(assetNos));
            batchItem.setSortOrder(sort++);
            batchItemsToInsert.add(batchItem);
        }

        // 保存批次
        EamInboundBatch batch = new EamInboundBatch();
        batch.setBatchNo(batchNo);
        batch.setPoId(poId);
        batch.setPoNo(order.getPoNo());
        batch.setInboundDate(inboundDate);
        batch.setOperator(operator);
        batch.setTotalQty(totalQty);
        batch.setAcceptedQty(acceptedQty);
        batch.setPendingQty(totalQty - acceptedQty);
        batch.setReturnQty(returnQty);
        batch.setExchangeQty(exchangeQty);
        batch.setConcessionQty(concessionQty);
        batch.setRemark(Objects.toString(dto.getRemark(), ""));
        batch.setUpdatedBy(operator);
        batchMapper.insert(batch);

        // 保存明细
        for (EamInboundBatchItem item : batchItemsToInsert) {
            item.setBatchId(batch.getId());
            batchItemMapper.insert(item);
        }

        // 批量插入资产台账
        for (EamAsset asset : assetsToInsert) {
            asset.setBatchId(batch.getId());
            assetMapper.insert(asset);
        }

        // ====== P0-4: 回写采购订单 ======
        // 更新订单明细的 receivedQty
        for (EamInboundCreateDTO.InboundItem item : inboundItems) {
            long modelId = item.getModelId() == null ? -1L : item.getModelId();
            int qty = item.getQty() == null ? 0 : item.getQty();
            String disposition = Objects.toString(item.getDisposition(), "");
            if (modelId <= 0 || qty <= 0) continue;

            // 只有通过的才计入 receivedQty
            int accepted = qty;
            if ("return".equals(disposition) || "exchange".equals(disposition) || "concession".equals(disposition)) {
                accepted = 0;
            }

            if (accepted > 0) {
                orderItemMapper.update(null,
                        new LambdaUpdateWrapper<EamPurchaseOrderItem>()
                                .eq(EamPurchaseOrderItem::getOrderId, poId)
                                .eq(EamPurchaseOrderItem::getModelId, modelId)
                                .setSql("received_qty = COALESCE(received_qty, 0) + " + accepted));
            }
        }

        // 重新查询订单明细计算整体状态
        List<EamPurchaseOrderItem> updatedItems = orderItemMapper.selectList(
                new LambdaQueryWrapper<EamPurchaseOrderItem>()
                        .eq(EamPurchaseOrderItem::getOrderId, poId));

        boolean allReceived = updatedItems.stream()
                .allMatch(it -> (it.getReceivedQty() != null ? it.getReceivedQty() : 0) >= it.getQty());
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
                        .set(EamPurchaseOrder::getUpdatedBy, operator));

        log.info("入庫批次已創建: batchNo={}, poId={}, 資產數={}, 訂單狀態→{}",
                batchNo, poId, assetsToInsert.size(), newStatus);

        // 返回批次信息
        Map<String, Object> result = batchToMap(batch);
        result.put("items", batchItemsToInsert.stream().map(it -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("modelId", it.getModelId());
            m.put("modelName", it.getModelName());
            m.put("qty", it.getQty());
            m.put("locationId", it.getLocationId());
            m.put("disposition", it.getDisposition() != null ? it.getDisposition() : "pass");
            m.put("rejectReason", it.getRejectReason());
            m.put("photos", it.getPhotos() != null ? JsonUtils.parseMapList(it.getPhotos()) : List.of());
            m.put("assetNos", it.getAssetNos() != null ? JsonUtils.parseStringList(it.getAssetNos()) : List.of());
            return m;
        }).collect(Collectors.toList()));
        result.put("generatedAssetCount", assetsToInsert.size());
        return result;
    }

    /* ==================== 内部方法 ==================== */

    private Map<String, Object> batchToMap(EamInboundBatch b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("batchNo", b.getBatchNo());
        m.put("poId", b.getPoId());
        m.put("poNo", b.getPoNo());
        m.put("inboundDate", b.getInboundDate());
        m.put("operator", b.getOperator());
        m.put("totalQty", b.getTotalQty());
        m.put("acceptedQty", b.getAcceptedQty());
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

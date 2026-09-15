package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamPurchaseSaveDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamPurchaseOrder;
import com.mftb.admin.entity.EamPurchaseOrderItem;
import com.mftb.admin.entity.EamPurchaseRequest;
import com.mftb.admin.mapper.EamPurchaseOrderItemMapper;
import com.mftb.admin.mapper.EamPurchaseOrderMapper;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import com.mftb.admin.service.EamPurchaseService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.ConvertUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamPurchaseServiceImpl implements EamPurchaseService {

    private final EamPurchaseOrderMapper orderMapper;
    private final EamPurchaseOrderItemMapper itemMapper;
    private final EamPurchaseRequestMapper requestMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    /* ==================== 分页查询 ==================== */

    @Override
    public PageResult<Map<String, Object>> pageOrders(int page, int size, String poNo, String processNo,
                                                       String supplier, String purchaser, String execStatus,
                                                       String createdAtStart, String createdAtEnd,
                                                       String updatedAtStart, String updatedAtEnd) {
        LambdaQueryWrapper<EamPurchaseOrder> wrapper = new LambdaQueryWrapper<>();
        if (poNo != null && !poNo.isBlank()) wrapper.like(EamPurchaseOrder::getPoNo, poNo.trim());
        if (supplier != null && !supplier.isBlank()) wrapper.like(EamPurchaseOrder::getSupplier, supplier.trim());
        if (purchaser != null && !purchaser.isBlank()) wrapper.like(EamPurchaseOrder::getPurchaser, purchaser.trim());
        if (execStatus != null && !execStatus.isBlank()) wrapper.eq(EamPurchaseOrder::getExecStatus, execStatus);
        if (createdAtStart != null) wrapper.ge(EamPurchaseOrder::getCreatedAt, createdAtStart);
        if (createdAtEnd != null) wrapper.lt(EamPurchaseOrder::getCreatedAt, createdAtEnd + " 23:59:59");
        if (updatedAtStart != null) wrapper.ge(EamPurchaseOrder::getUpdatedAt, updatedAtStart);
        if (updatedAtEnd != null) wrapper.lt(EamPurchaseOrder::getUpdatedAt, updatedAtEnd + " 23:59:59");
        // 关联采购申请编号筛选：先查匹配的申请 ID，再按 req_id IN 过滤
        if (processNo != null && !processNo.isBlank()) {
            List<Long> reqIds = requestMapper.selectList(new LambdaQueryWrapper<EamPurchaseRequest>()
                            .like(EamPurchaseRequest::getReqNo, processNo.trim())
                            .select(EamPurchaseRequest::getId))
                    .stream().map(EamPurchaseRequest::getId).collect(Collectors.toList());
            if (reqIds.isEmpty()) {
                return new PageResult<Map<String, Object>>(java.util.Collections.emptyList(), 0L);
            }
            wrapper.in(EamPurchaseOrder::getReqId, reqIds);
        }
        wrapper.orderByDesc(EamPurchaseOrder::getCreatedAt);

        Page<EamPurchaseOrder> pageObj = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        Page<EamPurchaseOrder> result = orderMapper.selectPage(pageObj, wrapper);

        // 批量补充明细总数与关联申请编号（供列表「验收入库进度/关联申请」列展示）
        Map<Long, Integer> totalQtyMap = new HashMap<>();
        Map<Long, String> reqNoMap = new HashMap<>();
        List<Long> orderIds = result.getRecords().stream().map(EamPurchaseOrder::getId).collect(Collectors.toList());
        if (!orderIds.isEmpty()) {
            itemMapper.selectList(new LambdaQueryWrapper<EamPurchaseOrderItem>()
                            .in(EamPurchaseOrderItem::getOrderId, orderIds)
                            .select(EamPurchaseOrderItem::getOrderId, EamPurchaseOrderItem::getQty))
                    .forEach(it -> totalQtyMap.merge(it.getOrderId(), it.getQty() == null ? 0 : it.getQty(), Integer::sum));
            List<Long> reqIds = result.getRecords().stream()
                    .map(EamPurchaseOrder::getReqId).filter(rid -> rid != null && rid > 0).collect(Collectors.toList());
            if (!reqIds.isEmpty()) {
                requestMapper.selectBatchIds(reqIds)
                        .forEach(req -> reqNoMap.put(req.getId(), req.getReqNo()));
            }
        }

        List<Map<String, Object>> records = result.getRecords().stream()
                .map(o -> {
                    Map<String, Object> m = orderToMap(o);
                    m.put("totalQty", totalQtyMap.getOrDefault(o.getId(), 0));
                    m.put("reqNo", o.getReqId() != null && o.getReqId() > 0
                            ? reqNoMap.get(o.getReqId()) : null);
                    return m;
                })
                .collect(Collectors.toList());
        return new PageResult<>(records, result.getTotal());
    }

    /* ==================== 详情 ==================== */

    @Override
    public Map<String, Object> getOrderDetail(long id) {
        EamPurchaseOrder order = orderMapper.selectById(id);
        if (order == null) throw new BusinessException("採購訂單不存在");

        Map<String, Object> map = orderToMap(order);

        // 查询明细
        List<EamPurchaseOrderItem> items = itemMapper.selectList(
                new LambdaQueryWrapper<EamPurchaseOrderItem>()
                        .eq(EamPurchaseOrderItem::getOrderId, id)
                        .orderByAsc(EamPurchaseOrderItem::getSortOrder));
        map.put("items", items.stream().map(this::itemToMap).collect(Collectors.toList()));

        // 解析 supplierGroups JSON
        if (order.getSupplierGroups() != null && !order.getSupplierGroups().isBlank()) {
            List<Map<String, Object>> groups = JsonUtils.parseMapList(order.getSupplierGroups());
            // 为每个 group 填充 items
            for (Map<String, Object> group : groups) {
                String gid = String.valueOf(group.get("id"));
                List<Map<String, Object>> groupItems = items.stream()
                        .filter(it -> gid.equals(it.getGroupId()))
                        .map(this::itemToMap)
                        .collect(Collectors.toList());
                group.put("items", groupItems);
            }
            map.put("supplierGroups", groups);
        }
        return map;
    }

    /* ==================== 创建订单（直接录入） ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createOrder(EamPurchaseSaveDTO dto) {
        String operator = operatorResolver.currentOperatorName();

        EamPurchaseOrder order = new EamPurchaseOrder();
        order.setReqId(dto.getReqId() != null ? dto.getReqId() : 0L);
        order.setSupplier(Objects.toString(dto.getSupplier(), ""));
        order.setAmount(dto.getAmount() != null ? dto.getAmount() : BigDecimal.ZERO);
        order.setDeliveryDate(Objects.toString(dto.getDeliveryDate(), ""));
        order.setPurchaser(Objects.toString(dto.getPurchaser(), ""));
        order.setDepartment(Objects.toString(dto.getDepartment(), ""));
        order.setRemark(Objects.toString(dto.getRemark(), ""));
        order.setExecStatus("pending");
        order.setStatus("pending");
        order.setAcceptedQty(0);
        order.setReturnQty(0);
        order.setExchangeQty(0);
        order.setConcessionQty(0);
        order.setUpdatedBy(operator);
        order.setUpdatedAt(LocalDateTime.now());

        // 供应商分组 JSON
        List<EamPurchaseSaveDTO.SupplierGroup> groups = dto.getSupplierGroups();
        if (groups != null && !groups.isEmpty()) {
            order.setSupplierGroups(JsonUtils.toJson(groups));
            // 取第一个分组的供应商作为兼容字段
            order.setSupplier(Objects.toString(groups.get(0).getSupplier(), ""));
        }

        // 生成訂單編號（DDCG+年月日+4位自增序號）
        order.setPoNo(bizSeqService.next(BizSeqService.RULE_EAM_PURCHASE_ORDER));
        orderMapper.insert(order);

        // 保存明细（从 supplierGroups 中提取）
        if (groups != null) {
            int sort = 0;
            for (EamPurchaseSaveDTO.SupplierGroup group : groups) {
                if (group.getItems() == null) continue;
                for (EamPurchaseSaveDTO.SupplierItem item : group.getItems()) {
                    saveOrderItem(order.getId(), group.getId(), item, sort++);
                }
            }
        }

        log.info("採購訂單已創建: id={}, poNo={}", order.getId(), order.getPoNo());
        return order.getId();
    }

    /* ==================== 更新执行信息 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateOrderExec(long id, EamPurchaseSaveDTO dto) {
        EamPurchaseOrder order = orderMapper.selectById(id);
        if (order == null) throw new BusinessException("採購訂單不存在");
        // 已驗收入庫的訂單不允許修改
        if ("received".equals(order.getStatus())) {
            throw new BusinessException("訂單已全部驗收入庫，不可修改");
        }

        // 執行狀態設為「已完成」時，所有明細的成交單價必須填寫
        if ("completed".equals(dto.getExecStatus()) && groups != null) {
            for (EamPurchaseSaveDTO.SupplierGroup group : groups) {
                if (group.getItems() == null) continue;
                for (EamPurchaseSaveDTO.SupplierItem item : group.getItems()) {
                    if (item.getConfirmedPrice() == null || item.getConfirmedPrice().compareTo(BigDecimal.ZERO) <= 0) {
                        throw new BusinessException("執行狀態為「已完成」時，所有物資明細的成交單價必須填寫且大於零：" + item.getModelName());
                    }
                }
            }
        }

        String operator = operatorResolver.currentOperatorName();

        LambdaUpdateWrapper<EamPurchaseOrder> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(EamPurchaseOrder::getId, id);

        if (dto.getPurchaser() != null) wrapper.set(EamPurchaseOrder::getPurchaser, dto.getPurchaser());
        if (dto.getDepartment() != null) wrapper.set(EamPurchaseOrder::getDepartment, dto.getDepartment());
        if (dto.getExecStatus() != null) wrapper.set(EamPurchaseOrder::getExecStatus, dto.getExecStatus());
        if (dto.getRemark() != null) wrapper.set(EamPurchaseOrder::getRemark, dto.getRemark());
        if (dto.getTrackingNo() != null) wrapper.set(EamPurchaseOrder::getTrackingNo, dto.getTrackingNo());

        // 供应商分组更新
        List<EamPurchaseSaveDTO.SupplierGroup> groups = dto.getSupplierGroups();
        if (groups != null && !groups.isEmpty()) {
            wrapper.set(EamPurchaseOrder::getSupplierGroups, JsonUtils.toJson(groups));

            // 重新计算成交金额
            BigDecimal confirmedAmount = BigDecimal.ZERO;
            for (EamPurchaseSaveDTO.SupplierGroup group : groups) {
                if (group.getItems() == null) continue;
                for (EamPurchaseSaveDTO.SupplierItem item : group.getItems()) {
                    BigDecimal cp = item.getConfirmedPrice();
                    BigDecimal price = item.getPrice() != null ? item.getPrice() : BigDecimal.ZERO;
                    int qty = item.getQty() != null ? item.getQty() : 1;
                    BigDecimal unitPrice = cp != null ? cp : price;
                    confirmedAmount = confirmedAmount.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
                }
            }
            wrapper.set(EamPurchaseOrder::getConfirmedAmount, confirmedAmount);
            wrapper.set(EamPurchaseOrder::getSupplier, Objects.toString(groups.get(0).getSupplier(), ""));

            // 保留已有明細的已驗收數量（按 groupId + sortOrder 匹配）
            List<EamPurchaseOrderItem> existingItems = itemMapper.selectList(
                    new LambdaQueryWrapper<EamPurchaseOrderItem>()
                            .eq(EamPurchaseOrderItem::getOrderId, id)
                            .orderByAsc(EamPurchaseOrderItem::getSortOrder));
            Map<String, Integer> receivedQtyMap = new HashMap<>();
            for (EamPurchaseOrderItem ei : existingItems) {
                String compositeKey = ei.getGroupId() + ":" + ei.getSortOrder();
                receivedQtyMap.put(compositeKey, ei.getReceivedQty() != null ? ei.getReceivedQty() : 0);
            }

            // 同步更新明细表（先刪後插）
            itemMapper.delete(new LambdaQueryWrapper<EamPurchaseOrderItem>()
                    .eq(EamPurchaseOrderItem::getOrderId, id));
            int sort = 0;
            for (EamPurchaseSaveDTO.SupplierGroup group : groups) {
                if (group.getItems() == null) continue;
                for (EamPurchaseSaveDTO.SupplierItem item : group.getItems()) {
                    // 查找匹配的已验收数量
                    String compositeKey = group.getId() + ":" + sort;
                    Integer preservedReceivedQty = receivedQtyMap.get(compositeKey);
                    saveOrderItem(id, group.getId(), item, sort, preservedReceivedQty);
                    sort++;
                }
            }
        }

        wrapper.set(EamPurchaseOrder::getUpdatedBy, operator);
        wrapper.set(EamPurchaseOrder::getUpdatedAt, LocalDateTime.now());
        orderMapper.update(null, wrapper);
    }

    /* ==================== 删除订单 ==================== */

    @Override
    public void deleteOrder(long id) {
        EamPurchaseOrder order = orderMapper.selectById(id);
        if (order == null) throw new BusinessException("採購訂單不存在");
        if (!"pending".equals(order.getExecStatus())) throw new BusinessException("僅待處理的訂單可刪除");
        orderMapper.deleteById(id);
        itemMapper.delete(new LambdaQueryWrapper<EamPurchaseOrderItem>()
                .eq(EamPurchaseOrderItem::getOrderId, id));
    }

    /* ==================== 从采购申请自动创建订单 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createOrderFromRequest(long requestId, List<Map<String, Object>> formDataItems) {
        EamPurchaseRequest req = requestMapper.selectById(requestId);
        if (req == null) throw new BusinessException("採購申請不存在");
        if (req.getOrderId() != null) throw new BusinessException("該申請已生成採購訂單");

        EamPurchaseOrder order = new EamPurchaseOrder();
        order.setReqId(req.getId());
        order.setSupplier("待定供應商");
        order.setAmount(req.getBudget() != null ? req.getBudget() : BigDecimal.ZERO);
        order.setDeliveryDate(LocalDate.now().plusDays(14).toString());
        order.setPurchaser(req.getApplicant());
        order.setDepartment(req.getDepartment());
        // 保留原始采购事由，追加来源说明
        String originalReason = req.getReason() != null ? req.getReason().trim() : "";
        order.setRemark(originalReason + "\n（由採購申請 " + req.getReqNo() + " 審批通過自動生成）");
        order.setExecStatus("pending");
        order.setStatus("pending");
        order.setAcceptedQty(0);
        order.setUpdatedBy("system");
        order.setUpdatedAt(LocalDateTime.now());

        // 生成訂單編號（DDCG+年月日+4位自增序號）
        order.setPoNo(bizSeqService.next(BizSeqService.RULE_EAM_PURCHASE_ORDER));
        orderMapper.insert(order);

        // 从 formData items 创建订单明细
        if (formDataItems != null && !formDataItems.isEmpty()) {
            int sort = 0;
            for (Map<String, Object> it : formDataItems) {
                EamPurchaseOrderItem item = new EamPurchaseOrderItem();
                item.setOrderId(order.getId());
                item.setGroupId(null);
                item.setModelId(ConvertUtils.toLong(it.get("modelId"), null));
                item.setModelName(Objects.toString(it.get("modelName"), ""));
                item.setCategoryName(Objects.toString(it.get("categoryName"), ""));
                item.setCategoryCode("");
                item.setBrandName(Objects.toString(it.get("brandName"), ""));
                // params JSON
                Object paramsObj = it.get("params");
                if (paramsObj != null) {
                    item.setParams(JsonUtils.toJson(paramsObj));
                }
                item.setPurchaseType("purchase");
                item.setQty(it.get("qty") instanceof Number n ? n.intValue() : 1);
                // 前端 estPrice 作为参考价
                item.setPrice(it.get("estPrice") instanceof Number n
                        ? BigDecimal.valueOf(n.doubleValue()) : BigDecimal.ZERO);
                item.setConfirmedPrice(null);
                item.setReceivedQty(0);
                item.setSortOrder(sort++);
                itemMapper.insert(item);
            }
        }

        // 回写申请表的 orderId
        requestMapper.update(null, new LambdaUpdateWrapper<EamPurchaseRequest>()
                .eq(EamPurchaseRequest::getId, req.getId())
                .set(EamPurchaseRequest::getOrderId, order.getId())
                .set(EamPurchaseRequest::getStatus, "approved"));

        log.info("從採購申請自動創建訂單: requestId={}, orderId={}, poNo={}, items={}",
                requestId, order.getId(), order.getPoNo(),
                formDataItems != null ? formDataItems.size() : 0);
        return order.getId();
    }

    /* ==================== 内部方法 ==================== */

    private void saveOrderItem(long orderId, String groupId, EamPurchaseSaveDTO.SupplierItem item, int sort) {
        saveOrderItem(orderId, groupId, item, sort, null);
    }

    private void saveOrderItem(long orderId, String groupId, EamPurchaseSaveDTO.SupplierItem item, int sort,
                                Integer preservedReceivedQty) {
        EamPurchaseOrderItem entity = new EamPurchaseOrderItem();
        entity.setOrderId(orderId);
        entity.setGroupId(groupId);
        entity.setModelId(item.getModelId());
        entity.setModelName(Objects.toString(item.getModelName(), ""));
        entity.setCategoryId(item.getCategoryId());
        entity.setCategoryName(Objects.toString(item.getCategoryName(), ""));
        entity.setCategoryCode(Objects.toString(item.getCategoryCode(), ""));
        entity.setBrandId(item.getBrandId());
        entity.setBrandName(Objects.toString(item.getBrandName(), ""));
        entity.setPurchaseType(Objects.toString(item.getPurchaseType(), ""));
        entity.setQty(item.getQty() != null ? item.getQty() : 1);
        entity.setPrice(item.getPrice() != null ? item.getPrice() : BigDecimal.ZERO);
        entity.setConfirmedPrice(item.getConfirmedPrice());
        // 保留已验收数量：更新时传入已有值，创建时为 null → 默认 0
        entity.setReceivedQty(preservedReceivedQty != null ? preservedReceivedQty : 0);
        entity.setSortOrder(sort);

        // params JSON
        if (item.getParams() != null) {
            entity.setParams(JsonUtils.toJson(item.getParams()));
        }
        itemMapper.insert(entity);
    }

    private Map<String, Object> orderToMap(EamPurchaseOrder o) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.getId());
        m.put("poNo", o.getPoNo());
        m.put("reqId", o.getReqId());
        m.put("supplier", o.getSupplier());
        m.put("amount", o.getAmount());
        m.put("confirmedAmount", o.getConfirmedAmount());
        m.put("deliveryDate", o.getDeliveryDate());
        m.put("purchaser", o.getPurchaser());
        m.put("department", o.getDepartment());
        m.put("remark", o.getRemark());
        m.put("trackingNo", o.getTrackingNo());
        m.put("execStatus", o.getExecStatus());
        m.put("status", o.getStatus());
        m.put("acceptedQty", o.getAcceptedQty());
        m.put("returnQty", o.getReturnQty());
        m.put("exchangeQty", o.getExchangeQty());
        m.put("concessionQty", o.getConcessionQty());
        m.put("createdAt", o.getCreatedAt() != null ? o.getCreatedAt().toString() : null);
        m.put("updatedBy", o.getUpdatedBy());
        m.put("updatedAt", o.getUpdatedAt() != null ? o.getUpdatedAt().toString() : null);
        return m;
    }

    private Map<String, Object> itemToMap(EamPurchaseOrderItem it) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", it.getId());
        m.put("key", String.valueOf(it.getId()));
        m.put("modelId", it.getModelId());
        m.put("modelName", it.getModelName());
        m.put("categoryId", it.getCategoryId());
        m.put("categoryName", it.getCategoryName());
        m.put("categoryCode", it.getCategoryCode());
        m.put("brandId", it.getBrandId());
        m.put("brandName", it.getBrandName());
        m.put("params", it.getParams() != null ? JsonUtils.parseMap(it.getParams()) : null);
        m.put("purchaseType", it.getPurchaseType());
        m.put("qty", it.getQty());
        m.put("price", it.getPrice());
        m.put("confirmedPrice", it.getConfirmedPrice());
        m.put("receivedQty", it.getReceivedQty());
        m.put("groupId", it.getGroupId());
        return m;
    }

}

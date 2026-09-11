package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamPurchaseOrder;
import com.mftb.admin.entity.EamPurchaseOrderItem;
import com.mftb.admin.entity.EamPurchaseRequest;
import com.mftb.admin.mapper.EamPurchaseOrderItemMapper;
import com.mftb.admin.mapper.EamPurchaseOrderMapper;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import com.mftb.admin.service.EamPurchaseService;
import com.mftb.admin.util.BizSeqService;
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

    /* ==================== 分頁查詢 ==================== */

    @Override
    public PageResult<Map<String, Object>> pageOrders(int page, int size, String poNo, String supplier,
                                                       String purchaser, String execStatus,
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
        wrapper.orderByDesc(EamPurchaseOrder::getCreatedAt);

        Page<EamPurchaseOrder> pageObj = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        Page<EamPurchaseOrder> result = orderMapper.selectPage(pageObj, wrapper);

        List<Map<String, Object>> records = result.getRecords().stream()
                .map(this::orderToMap)
                .collect(Collectors.toList());
        return new PageResult<>(records, result.getTotal());
    }

    /* ==================== 詳情 ==================== */

    @Override
    public Map<String, Object> getOrderDetail(long id) {
        EamPurchaseOrder order = orderMapper.selectById(id);
        if (order == null) throw new BusinessException("採購訂單不存在");

        Map<String, Object> map = orderToMap(order);

        // 查詢明細
        List<EamPurchaseOrderItem> items = itemMapper.selectList(
                new LambdaQueryWrapper<EamPurchaseOrderItem>()
                        .eq(EamPurchaseOrderItem::getOrderId, id)
                        .orderByAsc(EamPurchaseOrderItem::getSortOrder));
        map.put("items", items.stream().map(this::itemToMap).collect(Collectors.toList()));

        // 解析 supplierGroups JSON
        if (order.getSupplierGroups() != null && !order.getSupplierGroups().isBlank()) {
            List<Map<String, Object>> groups = JsonUtils.parseMapList(order.getSupplierGroups());
            // 為每個 group 填充 items
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

    /* ==================== 創建訂單（直接錄入） ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createOrder(Map<String, Object> data) {
        String operator = operatorResolver.currentOperatorName();

        EamPurchaseOrder order = new EamPurchaseOrder();
        order.setReqId(toLong(data.get("reqId"), 0L));
        order.setSupplier(str(data, "supplier"));
        order.setAmount(toBigDecimal(data.get("amount"), BigDecimal.ZERO));
        order.setDeliveryDate(str(data, "deliveryDate"));
        order.setPurchaser(str(data, "purchaser"));
        order.setRemark(str(data, "remark"));
        order.setExecStatus("pending");
        order.setStatus("pending");
        order.setAcceptedQty(0);
        order.setReturnQty(0);
        order.setExchangeQty(0);
        order.setConcessionQty(0);
        order.setUpdatedBy(operator);

        // 供應商分組 JSON
        Object sgObj = data.get("supplierGroups");
        if (sgObj instanceof List<?> sgList && !sgList.isEmpty()) {
            order.setSupplierGroups(JsonUtils.toJson(sgList));
            // 取第一個分組的供應商作為兼容字段
            Map<String, Object> first = (Map<String, Object>) sgList.get(0);
            order.setSupplier(str(first, "supplier"));
        }

        orderMapper.insert(order);

        // 生成 PO 編號
        String poNo = "PO" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))
                + String.format("%04d", order.getId());
        order.setPoNo(poNo);
        orderMapper.updateById(order);

        // 保存明細（從 supplierGroups 中提取）
        if (sgObj instanceof List<?> sgList) {
            int sort = 0;
            for (Object sg : sgList) {
                Map<String, Object> group = (Map<String, Object>) sg;
                String groupId = String.valueOf(group.get("id"));
                Object itemsObj = group.get("items");
                if (itemsObj instanceof List<?> itemList) {
                    for (Object it : itemList) {
                        Map<String, Object> itemMap = (Map<String, Object>) it;
                        saveOrderItem(order.getId(), groupId, itemMap, sort++);
                    }
                }
            }
        }

        log.info("採購訂單已創建: id={}, poNo={}", order.getId(), order.getPoNo());
        return order.getId();
    }

    /* ==================== 更新執行信息 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateOrderExec(long id, Map<String, Object> data) {
        EamPurchaseOrder order = orderMapper.selectById(id);
        if (order == null) throw new BusinessException("採購訂單不存在");

        String operator = operatorResolver.currentOperatorName();

        LambdaUpdateWrapper<EamPurchaseOrder> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(EamPurchaseOrder::getId, id);

        if (data.containsKey("purchaser")) wrapper.set(EamPurchaseOrder::getPurchaser, str(data, "purchaser"));
        if (data.containsKey("execStatus")) wrapper.set(EamPurchaseOrder::getExecStatus, str(data, "execStatus"));
        if (data.containsKey("remark")) wrapper.set(EamPurchaseOrder::getRemark, str(data, "remark"));
        if (data.containsKey("trackingNo")) wrapper.set(EamPurchaseOrder::getTrackingNo, str(data, "trackingNo"));

        // 供應商分組更新
        Object sgObj = data.get("supplierGroups");
        if (sgObj instanceof List<?> sgList && !sgList.isEmpty()) {
            wrapper.set(EamPurchaseOrder::getSupplierGroups, JsonUtils.toJson(sgList));

            // 重新計算成交金額
            BigDecimal confirmedAmount = BigDecimal.ZERO;
            for (Object sg : sgList) {
                Map<String, Object> group = (Map<String, Object>) sg;
                Object itemsObj = group.get("items");
                if (itemsObj instanceof List<?> itemList) {
                    for (Object it : itemList) {
                        Map<String, Object> itemMap = (Map<String, Object>) it;
                        BigDecimal cp = toBigDecimal(itemMap.get("confirmedPrice"), null);
                        BigDecimal price = toBigDecimal(itemMap.get("price"), BigDecimal.ZERO);
                        int qty = toInt(itemMap.get("qty"), 1);
                        BigDecimal unitPrice = cp != null ? cp : price;
                        confirmedAmount = confirmedAmount.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
                    }
                }
            }
            wrapper.set(EamPurchaseOrder::getConfirmedAmount, confirmedAmount);
            wrapper.set(EamPurchaseOrder::getSupplier, str((Map<String, Object>) sgList.get(0), "supplier"));

            // 同步更新明細表
            itemMapper.delete(new LambdaQueryWrapper<EamPurchaseOrderItem>()
                    .eq(EamPurchaseOrderItem::getOrderId, id));
            int sort = 0;
            for (Object sg : sgList) {
                Map<String, Object> group = (Map<String, Object>) sg;
                String groupId = String.valueOf(group.get("id"));
                Object itemsObj = group.get("items");
                if (itemsObj instanceof List<?> itemList) {
                    for (Object it : itemList) {
                        saveOrderItem(id, groupId, (Map<String, Object>) it, sort++);
                    }
                }
            }
        }

        wrapper.set(EamPurchaseOrder::getUpdatedBy, operator);
        orderMapper.update(null, wrapper);
    }

    /* ==================== 刪除訂單 ==================== */

    @Override
    public void deleteOrder(long id) {
        EamPurchaseOrder order = orderMapper.selectById(id);
        if (order == null) throw new BusinessException("採購訂單不存在");
        if (!"pending".equals(order.getExecStatus())) throw new BusinessException("僅待處理的訂單可刪除");
        orderMapper.deleteById(id);
        itemMapper.delete(new LambdaQueryWrapper<EamPurchaseOrderItem>()
                .eq(EamPurchaseOrderItem::getOrderId, id));
    }

    /* ==================== 從採購申請自動創建訂單 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createOrderFromRequest(long requestId) {
        EamPurchaseRequest req = requestMapper.selectById(requestId);
        if (req == null) throw new BusinessException("採購申請不存在");
        if (req.getOrderId() != null) throw new BusinessException("該申請已生成採購訂單");

        // 解析 formData 中的 items（如果有的話，從 OA formData JSON 中提取）
        // 這裡從 request 的基本信息構建訂單
        EamPurchaseOrder order = new EamPurchaseOrder();
        order.setReqId(req.getId());
        order.setSupplier("待定供應商");
        order.setAmount(req.getBudget() != null ? req.getBudget() : BigDecimal.ZERO);
        order.setDeliveryDate(LocalDate.now().plusDays(14).toString());
        order.setPurchaser(req.getApplicant());
        order.setDepartment(req.getDepartment());
        order.setRemark("由採購申請 " + req.getReqNo() + " 審批通過自動生成");
        order.setExecStatus("pending");
        order.setStatus("pending");
        order.setAcceptedQty(0);
        order.setUpdatedBy("system");
        orderMapper.insert(order);

        // 生成 PO 編號
        String poNo = "PO" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))
                + String.format("%04d", order.getId());
        order.setPoNo(poNo);
        orderMapper.updateById(order);

        // 回寫申請表的 orderId
        requestMapper.update(null, new LambdaUpdateWrapper<EamPurchaseRequest>()
                .eq(EamPurchaseRequest::getId, req.getId())
                .set(EamPurchaseRequest::getOrderId, order.getId())
                .set(EamPurchaseRequest::getStatus, "approved"));

        log.info("從採購申請自動創建訂單: requestId={}, orderId={}, poNo={}", requestId, order.getId(), poNo);
        return order.getId();
    }

    /* ==================== 內部方法 ==================== */

    private void saveOrderItem(long orderId, String groupId, Map<String, Object> item, int sort) {
        EamPurchaseOrderItem entity = new EamPurchaseOrderItem();
        entity.setOrderId(orderId);
        entity.setGroupId(groupId);
        entity.setModelId(toLong(item.get("modelId"), null));
        entity.setModelName(str(item, "modelName"));
        entity.setCategoryId(toLong(item.get("categoryId"), null));
        entity.setCategoryName(str(item, "categoryName"));
        entity.setCategoryCode(str(item, "categoryCode"));
        entity.setBrandId(toLong(item.get("brandId"), null));
        entity.setBrandName(str(item, "brandName"));
        entity.setPurchaseType(str(item, "purchaseType"));
        entity.setQty(toInt(item.get("qty"), 1));
        entity.setPrice(toBigDecimal(item.get("price"), BigDecimal.ZERO));
        entity.setConfirmedPrice(toBigDecimal(item.get("confirmedPrice"), null));
        entity.setReceivedQty(0);
        entity.setSortOrder(sort);

        // params JSON
        Object params = item.get("params");
        if (params != null) {
            entity.setParams(params instanceof String ? (String) params : JsonUtils.toJson(params));
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

    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : "";
    }

    private static Long toLong(Object v, Long def) {
        if (v == null) return def;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return def; }
    }

    private static int toInt(Object v, int def) {
        if (v == null) return def;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return def; }
    }

    private static BigDecimal toBigDecimal(Object v, BigDecimal def) {
        if (v == null) return def;
        if (v instanceof BigDecimal bd) return bd;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return def; }
    }
}

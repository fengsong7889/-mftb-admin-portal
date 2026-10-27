package com.mftb.admin.service;

import com.mftb.admin.dto.EamInboundCreateDTO;
import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * EAM 验收入库服务
 */
public interface EamInboundService {

    /**
     * 分页查询入库批次
     */
    PageResult<Map<String, Object>> pageBatches(int page, int size);

    /**
     * 入库批次详情
     */
    Map<String, Object> getBatchDetail(long batchId);

    /**
     * 创建入库批次：
     * 1. 生成资产编号
     * 2. 写入资产台账
     * 3. 回写采购订单 status / acceptedQty / receivedQty
     */
    Map<String, Object> createBatch(EamInboundCreateDTO dto);

    /**
     * 登記換貨二次發貨（PR-3）：寫入物流單號/預計到貨日，狀態置為 shipped
     */
    Map<String, Object> registerExchangeShipment(long batchId, long itemId, String trackingNo, String expectedDate);

    /**
     * 查詢指定訂單/分組的驗收記錄時間線（用於待驗收訂單展開詳情）
     * @param poId 採購訂單 ID
     * @param groupId 供應商分組 ID（可選，不傳則返回該訂單全部記錄）
     * @return 驗收記錄列表，按創建時間倒序
     */
    java.util.List<Map<String, Object>> getInspectionRecords(long poId, String groupId);
}

package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * EAM 驗收入庫服務
 */
public interface EamInboundService {

    /**
     * 分頁查詢入庫批次
     */
    PageResult<Map<String, Object>> pageBatches(int page, int size);

    /**
     * 入庫批次詳情
     */
    Map<String, Object> getBatchDetail(long batchId);

    /**
     * 創建入庫批次：
     * 1. 生成資產編號
     * 2. 寫入資產台賬
     * 3. 回寫採購訂單 status / acceptedQty / receivedQty
     */
    Map<String, Object> createBatch(Map<String, Object> data);
}

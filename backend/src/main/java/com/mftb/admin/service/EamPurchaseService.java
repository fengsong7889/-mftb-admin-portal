package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * EAM 採購訂單服務
 */
public interface EamPurchaseService {

    /**
     * 分頁查詢採購訂單
     */
    PageResult<Map<String, Object>> pageOrders(int page, int size, String poNo, String supplier,
                                                String purchaser, String execStatus,
                                                String createdAtStart, String createdAtEnd,
                                                String updatedAtStart, String updatedAtEnd);

    /**
     * 採購訂單詳情
     */
    Map<String, Object> getOrderDetail(long id);

    /**
     * 創建採購訂單（直接錄入）
     */
    long createOrder(Map<String, Object> data);

    /**
     * 更新採購訂單（執行信息回填/狀態推進）
     */
    void updateOrderExec(long id, Map<String, Object> data);

    /**
     * 刪除採購訂單（僅 pending 可刪）
     */
    void deleteOrder(long id);

    /**
     * 審批通過 → 自動從採購申請創建採購訂單
     * @return 生成的訂單 ID
     */
    long createOrderFromRequest(long requestId);
}

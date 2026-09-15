package com.mftb.admin.service;

import com.mftb.admin.dto.EamPurchaseSaveDTO;
import com.mftb.admin.dto.PageResult;

import java.util.List;
import java.util.Map;

/**
 * EAM 采购订单服务
 */
public interface EamPurchaseService {

    /**
     * 分页查询采购订单
     * @param processNo 关联采购申请编号（模糊）
     */
    PageResult<Map<String, Object>> pageOrders(int page, int size, String poNo, String processNo,
                                                String supplier, String purchaser, String execStatus,
                                                String createdAtStart, String createdAtEnd,
                                                String updatedAtStart, String updatedAtEnd);

    /**
     * 采购订单详情
     */
    Map<String, Object> getOrderDetail(long id);

    /**
     * 创建采购订单（直接录入）
     */
    long createOrder(EamPurchaseSaveDTO dto);

    /**
     * 更新采购订单（执行信息回填/状态推进）
     */
    void updateOrderExec(long id, EamPurchaseSaveDTO dto);

    /**
     * 删除采购订单（仅 pending 可删）
     */
    void deleteOrder(long id);

    /**
     * 审批通过 → 自动从采购申请创建采购订单
     * @param requestId 采购申请 ID
     * @param formDataItems OA 表单中的物资明细（来自 formData.items）
     * @return 生成的订单 ID
     */
    long createOrderFromRequest(long requestId, List<Map<String, Object>> formDataItems);
}

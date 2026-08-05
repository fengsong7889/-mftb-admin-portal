package com.mftb.admin.service;

import com.mftb.admin.dto.AdHotInventoryVO;
import com.mftb.admin.dto.AdHotOrderRequest;
import com.mftb.admin.dto.AdOrderVO;

/**
 * 人气商家广告销售服务
 */
public interface AdSalesHotService {

    /** 查询可购买格子（皮肤 x 日期, 不限库存, 标记本商家已购买格子） */
    AdHotInventoryVO inventory(Long algoId, String storeCode, String groupCode);

    /** 提交订单并从推广金账户扣款（同商家已购买的皮肤x日期不可重复购买） */
    AdOrderVO placeOrder(AdHotOrderRequest request);
}

package com.mftb.admin.service;

import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdSignboardInventoryVO;
import com.mftb.admin.dto.AdSignboardOrderRequest;

/**
 * 金字招牌广告销售服务
 */
public interface AdSalesSignboardService {

    /** 查询可购买格子（标签 x 日期）+ 标签计价信息 */
    AdSignboardInventoryVO inventory(Long algoId, String storeCode, String groupCode);

    /** 提交订单并从推广金账户扣款 */
    AdOrderVO placeOrder(AdSignboardOrderRequest request);
}

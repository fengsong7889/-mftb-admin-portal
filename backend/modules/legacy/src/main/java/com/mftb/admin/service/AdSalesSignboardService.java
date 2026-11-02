package com.mftb.admin.service;

import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdSignboardInventoryVO;
import com.mftb.admin.dto.AdSignboardOrderRequest;

/**
 * 金字招牌广告销售服务
 */
public interface AdSalesSignboardService {

    /**
     * 查询可购买标签格子（标签 x 日期）+ 标签计价信息
     *
     * @param channel 業務頻道：定價按「算法×頻道」配置，非空时只取该頻道的定價；为空退回旧口径
     */
    AdSignboardInventoryVO inventory(Long algoId, String storeCode, String groupCode, Integer channel);

    /** 提交订单并从推广金账户扣款 */
    AdOrderVO placeOrder(AdSignboardOrderRequest request);
}

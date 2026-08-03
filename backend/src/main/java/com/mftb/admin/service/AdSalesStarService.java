package com.mftb.admin.service;

import com.mftb.admin.dto.AdInventoryVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdStarOrderRequest;

/**
 * 无敌星星广告销售服务（库存查询 + 下单扣款）
 */
public interface AdSalesStarService {

    /** 查询可购买格子（商圈 x 日期 x 餐段，预售窗口内） */
    AdInventoryVO inventory(Long algoId);

    /** 提交订单并从推广金账户扣款 */
    AdOrderVO placeOrder(AdStarOrderRequest request);
}

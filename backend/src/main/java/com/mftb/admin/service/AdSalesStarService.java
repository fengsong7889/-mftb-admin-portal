package com.mftb.admin.service;

import com.mftb.admin.dto.AdInventoryVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdStarOrderRequest;

/**
 * 无敌星星广告销售服务（库存查询 + 下单扣款）
 */
public interface AdSalesStarService {

    /** 查询可购买格子（商圈 x 日期 x 餐段，预售窗口内；storeCode/groupCode 用于屏蔽商家拦截） */
    AdInventoryVO inventory(Long algoId, String storeCode, String groupCode);

    /** 提交订单并从推广金账户扣款 */
    AdOrderVO placeOrder(AdStarOrderRequest request);

    /** 加购锁定格子 60 秒（其它商家看到已售罄，到期自动释放） */
    void lockCells(AdStarOrderRequest request);

    /** 释放加购锁（移除购物车/取消时调用） */
    void unlockCells(AdStarOrderRequest request);
}

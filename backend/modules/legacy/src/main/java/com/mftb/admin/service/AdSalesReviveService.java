package com.mftb.admin.service;

import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdReviveInventoryVO;
import com.mftb.admin.dto.AdReviveOrderRequest;

/**
 * 盘活复苏广告销售服务（库存查询 + 加购锁 + 下单扣款）
 */
public interface AdSalesReviveService {

    /**
     * 查询可购买格子（商圈 x 日期；storeCode/groupCode 用于屏蔽商家拦截）
     *
     * @param channel 業務頻道：定價按「算法×頻道」配置，非空时只取该頻道的定價；为空退回旧口径
     */
    AdReviveInventoryVO inventory(Long algoId, String storeCode, String groupCode, Integer channel);

    /** 加购锁定格子 60 秒（占用库存额度，到期自动释放） */
    void lockCells(AdReviveOrderRequest request);

    /** 释放加购锁（移除购物车/取消时调用） */
    void unlockCells(AdReviveOrderRequest request);

    /** 提交订单并从推广金账户扣款（支持赠送天数抵扣） */
    AdOrderVO placeOrder(AdReviveOrderRequest request);
}

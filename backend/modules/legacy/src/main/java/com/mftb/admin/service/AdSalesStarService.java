package com.mftb.admin.service;

import com.mftb.admin.dto.AdInventoryVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdStarOrderRequest;

/**
 * 无敌星星广告销售服务（库存查询 + 下单扣款）
 */
public interface AdSalesStarService {

    /**
     * 查询可购买格子（商圈 x 日期 x 餐段，预售窗口内；storeCode/groupCode 用于屏蔽商家拦截）
     *
     * @param channel 業務頻道：定價按「算法×頻道」配置，非空时只取该頻道的定價；
     *                为空时退回旧口径（取最新一条）仅供未升级调用方
     */
    AdInventoryVO inventory(Long algoId, String storeCode, String groupCode, Integer channel);

    /** 提交订单并从推广金账户扣款 */
    AdOrderVO placeOrder(AdStarOrderRequest request);

    /** 加购锁定格子 60 秒（其它商家看到已售罄，到期自动释放） */
    void lockCells(AdStarOrderRequest request);

    /** 释放加购锁（移除购物车/取消时调用） */
    void unlockCells(AdStarOrderRequest request);
}

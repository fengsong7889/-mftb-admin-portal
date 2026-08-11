package com.mftb.admin.service;

import com.mftb.admin.dto.AdOrderDetailVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.PageResult;

/**
 * 推广广告订单服务（订单查询 + 退款）
 */
public interface AdOrderService {

    /** 订单分页查询 */
    PageResult<AdOrderVO> page(long page, long size, String orderNo, Integer algoType,
                               String groupCode, String storeCode, Integer status,
                               String startDate, String endDate);

    /** 订单详情（含明细） */
    AdOrderDetailVO detail(String orderNo);

    /** 退款：按取消扣费梯度计算应退金额，回补推广金账户并释放格子 */
    AdOrderDetailVO refund(String orderNo);

    /** 取消订单：状态变为已取消(5)，释放格子并回补推广金 */
    AdOrderDetailVO cancel(String orderNo);
}

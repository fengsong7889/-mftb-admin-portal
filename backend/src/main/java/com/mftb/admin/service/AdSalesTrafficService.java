package com.mftb.admin.service;

import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdTrafficOrderRequest;

/**
 * 投流广告销售服务（流量包购买下单）
 */
public interface AdSalesTrafficService {

    /** 提交投流广告订单并从推广金账户扣款（支持赠送天数抵扣） */
    AdOrderVO placeOrder(AdTrafficOrderRequest request);
}

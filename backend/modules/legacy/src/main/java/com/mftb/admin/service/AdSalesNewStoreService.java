package com.mftb.admin.service;

import com.mftb.admin.dto.AdNewStoreInventoryVO;
import com.mftb.admin.dto.AdNewStoreOrderRequest;
import com.mftb.admin.dto.AdOrderVO;

/**
 * 新店广告销售服务（赠送天数查询 + 下单抵扣）
 * <p>
 * 新店广告与无敌星星/盘活复苏的核心区别: 无商圈/定价/推广金扣款，
 * 纯粹使用赠送天数抵扣，实付为 $0。
 */
public interface AdSalesNewStoreService {

    /** 查询门店赠送天数余额（= 可购买库存） */
    AdNewStoreInventoryVO inventory(Long algoId, String storeCode);

    /** 提交订单（赠送天数全额抵扣，无推广金扣款） */
    AdOrderVO placeOrder(AdNewStoreOrderRequest request);
}

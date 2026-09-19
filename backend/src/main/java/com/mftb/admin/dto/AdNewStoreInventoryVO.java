package com.mftb.admin.dto;

import lombok.Data;

/**
 * 新店广告库存（赠送天数余额）查询结果
 */
@Data
public class AdNewStoreInventoryVO {

    /** 关联算法ID */
    private Long algoId;

    /** 算法名称 */
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 门店编码 */
    private String storeCode;

    /** 门店名称 */
    private String storeName;

    /** 赠送总天数 */
    private int totalGiftDays;

    /** 已使用赠送天数 */
    private int usedGiftDays;

    /** 剩余可用赠送天数（= 可购买天数） */
    private int remainingGiftDays;

    /** 赠送有效期止（最近一条赠送记录的到期日） */
    private String expireDate;
}

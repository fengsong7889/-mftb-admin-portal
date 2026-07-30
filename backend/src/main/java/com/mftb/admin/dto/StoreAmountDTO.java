package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 门店金额明细（充值营业额扣款门店 / 合并欠款偿还门店共用）
 */
@Data
public class StoreAmountDTO {

    /** 门店ID */
    private String storeId;

    /** 门店展示名称（含渠道等信息，与前端下拉 label 一致） */
    private String storeLabel;

    /** 归属BD（合并偿还门店使用） */
    private String bd;

    /** 金额 */
    private BigDecimal amount;
}

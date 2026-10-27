package com.mftb.admin.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 门店金额明细（充值营业额扣款门店 / 合并欠款偿还门店共用）
 */
@Data
public class StoreAmountDTO {

    /** 门店ID */
    @NotBlank(message = "門店ID不能為空")
    private String storeId;

    /** 门店展示名称（含渠道等信息，与前端下拉 label 一致） */
    private String storeLabel;

    /** 归属BD（合并偿还门店使用） */
    private String bd;

    /** 金额 */
    @NotNull(message = "金額不能為空")
    @DecimalMin(value = "0.01", message = "金額必須大於 0")
    @DecimalMax(value = "99999999.99", message = "金額超出上限")
    private BigDecimal amount;
}

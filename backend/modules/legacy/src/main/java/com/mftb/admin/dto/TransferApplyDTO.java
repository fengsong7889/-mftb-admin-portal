package com.mftb.admin.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 推广金转账申请（字段与前端 TransferAdd 提交的 extra 一致）
 */
@Data
public class TransferApplyDTO {

    /** 转出集团ID */
    @NotBlank(message = "轉出集團ID不能為空")
    private String fromGroupId;

    @NotBlank(message = "轉出集團名稱不能為空")
    private String fromGroupName;

    /** 转出集团品牌 */
    @NotBlank(message = "品牌不能為空")
    private String brand;

    /** 转入集团ID */
    @NotBlank(message = "轉入集團ID不能為空")
    private String toGroupId;

    @NotBlank(message = "轉入集團名稱不能為空")
    private String toGroupName;

    /** 转账金额 */
    @NotNull(message = "轉賬金額不能為空")
    @DecimalMin(value = "0.01", message = "轉賬金額必須大於 0")
    @DecimalMax(value = "99999999.99", message = "轉賬金額超出上限")
    private BigDecimal transferAmount;

    private String remark;
}

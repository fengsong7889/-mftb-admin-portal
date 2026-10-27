package com.mftb.admin.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 推广金扣款申请（字段与前端 DeductAdd 提交的 extra 一致）
 */
@Data
public class DeductApplyDTO {

    /** 集团ID */
    @NotBlank(message = "集團ID不能為空")
    private String groupId;

    @NotBlank(message = "集團名稱不能為空")
    private String groupName;

    @NotBlank(message = "品牌不能為空")
    private String brand;

    /** 扣款方式: account=账户扣款 consume=消费扣款 batch=批次扣款 */
    @Pattern(regexp = "^(account|consume|batch)$", message = "扣款方式不合法")
    private String deductMethod;

    /** 扣款金额 */
    @NotNull(message = "扣款金額不能為空")
    @DecimalMin(value = "0.01", message = "扣款金額必須大於 0")
    @DecimalMax(value = "99999999.99", message = "扣款金額超出上限")
    private BigDecimal deductAmount;

    /** 集团当前虚拟余额（仅前端展示，后端以账户实际余额校验，不接受负数） */
    @DecimalMin(value = "0.00", message = "餘額不能為負數")
    private BigDecimal virtualBalance;

    /** 消费渠道 / 消费门店 / 消费类型 / 消费BD（消费扣款使用） */
    private String consumeChannel;
    private String consumeStore;
    private String consumeType;
    private String consumeBd;

    /** 指定扣款批次号（批次扣款使用） */
    private String batchNo;

    /** 批次可扣余额（仅前端展示，后端以实际值校验） */
    @DecimalMin(value = "0.00", message = "批次可扣餘額不能為負數")
    private BigDecimal batchDeductible;

    /** 批次结算方式展示名 */
    private String batchSettlement;

    private String remark;
}

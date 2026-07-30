package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 推广金扣款申请（字段与前端 DeductAdd 提交的 extra 一致）
 */
@Data
public class DeductApplyDTO {

    /** 集团ID */
    private String groupId;
    private String groupName;
    private String brand;

    /** 扣款方式: account=账户扣款 consume=消费扣款 batch=批次扣款 */
    private String deductMethod;

    /** 扣款金额 */
    private BigDecimal deductAmount;

    /** 集团当前虚拟余额（前端展示值，后端以账户实际余额校验） */
    private BigDecimal virtualBalance;

    /** 消费渠道 / 消费门店 / 消费类型 / 消费BD（消费扣款使用） */
    private String consumeChannel;
    private String consumeStore;
    private String consumeType;
    private String consumeBd;

    /** 指定扣款批次号（批次扣款使用） */
    private String batchNo;

    /** 批次可扣余额 */
    private BigDecimal batchDeductible;

    /** 批次结算方式展示名 */
    private String batchSettlement;

    private String remark;
}

package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 推广金转账申请（字段与前端 TransferAdd 提交的 extra 一致）
 */
@Data
public class TransferApplyDTO {

    /** 转出集团ID */
    private String fromGroupId;
    private String fromGroupName;

    /** 转出集团品牌 */
    private String brand;

    /** 转出集团当前虚拟余额（前端展示值，后端以账户实际余额校验） */
    private BigDecimal fromVirtualBalance;

    /** 转入集团ID */
    private String toGroupId;
    private String toGroupName;

    /** 转账金额 */
    private BigDecimal transferAmount;

    private String remark;
}

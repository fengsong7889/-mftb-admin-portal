package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 消费风控列表行视图对象（字段命名与前端消费风控表格 dataIndex 一致）
 */
@Data
public class FinRiskVO {

    private String groupId;
    private String groupName;
    private String brand;

    /** 未结清欠款合计 */
    private BigDecimal unsettledDebt;

    /** 累计已付金额（全额池 + 分期已付） */
    private BigDecimal paidPool;

    /** 累计已消费（广告消费 + 消费扣款 - 退款） */
    private BigDecimal totalConsumed;

    /** 当月释放额度（monthly 模式=Σ批次未付×比例；repay 模式=0） */
    private BigDecimal monthlyRelease;

    /** 当前可用额度（null=不限额） */
    private BigDecimal availableAmount;

    /** 是否受限额管控 */
    private Boolean limited;

    /** 状态: enabled=启用 disabled=停用 */
    private String status;

    /** 风控模式: repay=还款释放 monthly=每月比例释放 */
    private String releaseMode;

    /** 每月释放比例（小数） */
    private BigDecimal monthlyReleaseRatio;

    /** 账户状态（与账户余额菜单同步）: normal / frozen / mergeFrozen / cancelled */
    private String accountStatus;

    private String remark;
    private String updatedBy;
    private String updatedAt;
}

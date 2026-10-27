package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 消费风控分页原始行（服务层据此聚合统计指标）
 */
@Data
public class FinRiskPageRow {

    private String groupId;
    private String groupName;
    private String brand;
    /** 账户状态（与账户余额菜单同步）: normal / frozen / mergeFrozen / cancelled */
    private String accountStatus;
    /** 风控模式: repay / monthly */
    private String releaseMode;
    /** 每月释放比例（小数） */
    private BigDecimal monthlyReleaseRatio;
    /** 状态: enabled / disabled */
    private String status;
    private String remark;
    private String updatedBy;
    private String updatedAt;
}

package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材领用统计 VO（“我的资产”耗材页签数据源）
 */
@Data
public class EamConsumableClaimStatsVO {
    /** 本人领用单总数 */
    private Long claimCount;
    /** 待发放（历史待审批） */
    private Long pendingCount;
    /** 待出库（历史已审批） */
    private Long approvedCount;
    /** 已出库 */
    private Long issuedCount;
}

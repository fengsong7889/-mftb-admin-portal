package com.mftb.admin.dto;

import lombok.Data;

/**
 * 领用统计 VO
 */
@Data
public class EamClaimStatsVO {
    private Long employeeCount;
    /**
     * 筛选范围内的全部领用记录数（不加任何状态条件，含取消、遗失/报废/送修等终止态）。
     * <p>个人视图第一张卡取它，与「全部記錄」页签严格同源；
     * 不要用 claimedCount + returnedCount 代替——那会漏掉待签/取消/异常终止的记录。
     */
    private Long totalCount;
    private Long claimedCount;
    private Long returnedCount;
    private Long pendingSignatureCount;
}

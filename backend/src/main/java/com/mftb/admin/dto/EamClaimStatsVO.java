package com.mftb.admin.dto;

import lombok.Data;

/**
 * 领用统计 VO
 */
@Data
public class EamClaimStatsVO {
    private Long employeeCount;
    private Long claimedCount;
    private Long returnedCount;
    private Long pendingSignatureCount;
}

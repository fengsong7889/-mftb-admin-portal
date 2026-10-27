package com.mftb.admin.dto;

import lombok.Data;

/**
 * 员工领用汇总 VO
 */
@Data
public class EamClaimEmployeeSummaryVO {
    private Long employeeId;
    private String empNo;
    private String empName;
    private Long departmentId;
    private String department;
    private Long claimedCount;
    private Long returnedCount;
    private Long pendingCount;
    private Long proxyPendingCount;
    private String lastClaimDate;
}

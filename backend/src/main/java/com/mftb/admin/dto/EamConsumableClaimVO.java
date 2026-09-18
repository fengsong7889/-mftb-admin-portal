package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 耗材领用单视图对象（含明细）
 */
@Data
public class EamConsumableClaimVO {
    private Long id;
    private String claimNo;
    private Long applicantId;
    private String applicantName;
    private String applicantEmpId;
    private String department;
    private String reason;
    private String status;
    private Long approverId;
    private String approverName;
    private String approvedAt;
    private String approveRemark;
    private String issueOperator;
    private String issuedAt;
    private String cancelReason;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;

    /** 明细行 */
    private List<EamConsumableClaimItemVO> items;
    /** 品类数 */
    private Integer totalKinds;
    /** 领用总数量 */
    private Integer totalQty;
}

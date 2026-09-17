package com.mftb.admin.dto;

import lombok.Data;

/**
 * 领用记录视图 VO
 */
@Data
public class EamClaimVO {
    private Long id;
    private String claimNo;
    private Long assetId;
    private Long sourceTransferId;
    private Long previousClaimId;
    private String updatedBy;
    private String assetNo;
    private String assetName;
    private String assetType;
    private String brand;
    private Integer companyBrand;
    private Long employeeId;
    private String empNo;
    private String empName;
    private String department;
    private String claimDate;
    private String claimReason;
    private String remark;
    private String operator;
    private String status;
    private String signatureStatus;
    private Integer proxyMode;
    private String proxyReason;
    private String signedAt;
    private String returnDate;
    private String returnReason;
    private String cancelledReason;
    private String createdAt;
    private String updatedAt;
    private String contentHash;
    /** 签名凭证 Data URL（签署后才有） */
    private String signatureImageUrl;
}

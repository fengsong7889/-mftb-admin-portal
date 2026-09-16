package com.mftb.admin.dto;

import lombok.Data;

/**
 * 归还记录视图 VO
 */
@Data
public class EamReturnVO {
    private Long id;
    private String returnNo;
    private String sourceType;
    private Long sourceId;
    private Long claimId;
    private Long borrowId;
    private Long assetId;
    private String assetNo;
    private String assetName;
    private Long employeeId;
    private String empName;
    private String operatorName;
    private String returnDate;
    private String returnReason;
    private String conditionNote;
    private String returnStatus;
    private String assetCondition;
    private String exceptionReason;
    private String disposition;
    private String dispositionDate;
    private Integer recovered;
    private String recoveredDate;
    private String recoveredNote;
    private Long actualReturneeId;
    private String actualReturneeName;
    private Long compensationId;
    private String createdAt;
    private String updatedAt;
    /** 凭证 Data URL */
    private String evidenceImageUrl;
}

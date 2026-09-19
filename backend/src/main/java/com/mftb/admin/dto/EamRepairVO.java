package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/** 维修记录视图对象 */
@Data
public class EamRepairVO {

    private Long id;
    private Long assetId;
    private String assetNo;
    private String assetName;
    private String repairDate;
    private String faultDesc;
    private String repairContent;
    private String repairBy;
    private BigDecimal cost;
    private String finishDate;
    private String status;
    private String applicant;
    private String causeType;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;
}

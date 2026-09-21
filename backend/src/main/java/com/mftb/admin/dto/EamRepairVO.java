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
    /** 资产品牌（来自关联资产） */
    private String brand;
    private String repairDate;
    private String faultDesc;
    private String repairContent;
    private String repairBy;
    private BigDecimal cost;
    private String finishDate;
    private String status;
    private String applicant;
    private String causeType;
    /** 关联归还记录 ID（从归还处置自动创建时有值） */
    private Long returnId;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;
}

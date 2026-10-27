package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/** 维修记录保存 DTO */
@Data
public class EamRepairSaveDTO {

    /** 资产 ID */
    private Long assetId;

    /** 维修日期 */
    private String repairDate;

    /** 故障描述 */
    private String faultDesc;

    /** 维修内容 */
    private String repairContent;

    /** 维修方 */
    private String repairBy;

    /** 维修费用（MOP） */
    private BigDecimal cost;

    /** 申请人/部门 */
    private String applicant;

    /** 损坏原因：human/natural/third_party/quality */
    private String causeType;

    /** 幂等请求键（直接登记送修防重，可空） */
    private String requestKey;
}

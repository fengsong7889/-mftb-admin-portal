package com.mftb.admin.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

/** 台账响应包含只读来源信息，前端无需拼接或伪造入库信息。 */
@Data
@EqualsAndHashCode(callSuper = true)
public class EamAssetVO extends EamAssetSaveDTO {
    private Long id;
    private Long orderId;
    private Long batchId;
    private String purchaseType;
    private String applicant;
    private String updatedBy;
    private String createdAt;
    private String updatedAt;
    private String inboundBatchNo;
    private String inboundDate;
    private Integer inboundQty;
    private String inspector;
}

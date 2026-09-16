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
    /** 存放位置-省份 */
    private String province;
    /** 存放位置-城市 */
    private String city;
    /** 存放位置-区县 */
    private String district;
    /** 存放位置-详细地址 */
    private String address;
}

package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** 台账响应包含只读来源信息，前端无需拼接或伪造入库信息。 */
@Data
@EqualsAndHashCode(callSuper = true)
public class EamAssetVO extends EamAssetSaveDTO {
    private Long id;
    /** 只读：当前持有人 ID（sys_user.id），无人持有时显式返回 null。 */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private Long currentHolderId;
    private Long activeClaimId;
    private Long holdVersion;
    private String claimDate;
    private boolean transferable;
    private String transferBlockedReason;
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

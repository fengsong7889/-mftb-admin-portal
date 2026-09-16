package com.mftb.admin.dto;

import lombok.Data;

/**
 * 领用事件 VO
 */
@Data
public class EamClaimEventVO {
    private Long id;
    private Long claimId;
    private String eventType;
    private String operatorName;
    private String remark;
    private String createdAt;
}

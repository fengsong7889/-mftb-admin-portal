package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材领用审批参数
 */
@Data
public class EamConsumableApproveDTO {
    /** 领用单 ID */
    private Long claimId;
    /** 是否通过 */
    private Boolean pass;
    /** 审批意见 */
    private String remark;
}

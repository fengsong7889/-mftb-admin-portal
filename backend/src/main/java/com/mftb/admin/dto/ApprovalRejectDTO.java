package com.mftb.admin.dto;

import lombok.Data;

/**
 * 审批驳回请求
 */
@Data
public class ApprovalRejectDTO {

    /** 驳回原因 */
    private String reason;
}

package com.mftb.admin.dto;

import lombok.Data;

/**
 * 流程审批开关更新请求
 */
@Data
public class WorkflowApprovalToggleDTO {

    /** 审批开关: true=开启审批 */
    private Boolean value;
}

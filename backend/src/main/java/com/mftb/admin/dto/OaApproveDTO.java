package com.mftb.admin.dto;

import lombok.Data;

/**
 * OA审批操作请求体
 */
@Data
public class OaApproveDTO {

    /** 审批意见（可选） */
    private String comment;
}

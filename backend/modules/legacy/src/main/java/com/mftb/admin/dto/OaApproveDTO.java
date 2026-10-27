package com.mftb.admin.dto;

import lombok.Data;

/**
 * OA审批操作请求体
 */
@Data
public class OaApproveDTO {

    /** 审批意见（可选） */
    private String comment;

    /** 表单数据JSON（AI申请审批时传递模型配置和额度设置） */
    private String formData;
}

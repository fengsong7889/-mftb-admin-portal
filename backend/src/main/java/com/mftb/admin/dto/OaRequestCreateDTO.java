package com.mftb.admin.dto;

import lombok.Data;

/**
 * OA流程发起请求体
 */
@Data
public class OaRequestCreateDTO {

    /** 流程类型编码（对应 biz_oa_process.process_code） */
    private String processCode;

    /** 流程标题 */
    private String title;

    /** 表单数据JSON */
    private String formData;
}

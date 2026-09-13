package com.mftb.admin.dto;

import lombok.Data;

/**
 * OA 驳回请求体
 */
@Data
public class OaRejectDTO {

    /** 驳回原因（可选） */
    private String reason;
}

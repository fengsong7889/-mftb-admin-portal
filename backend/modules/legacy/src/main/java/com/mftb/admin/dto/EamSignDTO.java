package com.mftb.admin.dto;

import lombok.Data;

/**
 * 签署请求 DTO
 */
@Data
public class EamSignDTO {
    /** 领用 ID */
    private Long claimId;
    /** 签名图片 Data URL（Base64 PNG） */
    private String signatureImage;
}

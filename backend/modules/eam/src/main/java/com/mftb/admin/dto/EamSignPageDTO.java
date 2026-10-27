package com.mftb.admin.dto;

import lombok.Data;

/**
 * 钉钉签署页提交 DTO（令牌免登）
 */
@Data
public class EamSignPageDTO {
    /** 签署链接中的 HMAC 令牌 */
    private String token;
    /** 签名图片 Data URL（Base64 PNG） */
    private String signatureImage;
}

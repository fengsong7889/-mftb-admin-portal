package com.mftb.admin.dto;

import lombok.Data;

/**
 * 赔付找回复核请求 DTO
 */
@Data
public class EamCompensationReviewDTO {
    /** 赔付记录 ID */
    private Long compensationId;
    /** 复核后应赔金额（分） */
    private Long newAmount;
    /** 调整理由 */
    private String reason;
}

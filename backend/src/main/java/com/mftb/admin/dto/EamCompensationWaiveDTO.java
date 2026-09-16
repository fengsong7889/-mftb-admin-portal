package com.mftb.admin.dto;

import lombok.Data;

/**
 * 赔付免赔请求 DTO
 */
@Data
public class EamCompensationWaiveDTO {
    /** 赔付记录 ID */
    private Long compensationId;
    /** 免赔原因 */
    private String waiveReason;
}

package com.mftb.admin.dto;

import lombok.Data;

/**
 * 归还请求 DTO
 */
@Data
public class EamReturnDTO {
    /** 领用 ID */
    private Long claimId;
    /** 归还日期 yyyy-MM-dd */
    private String returnDate;
    /** 归还原因 */
    private String returnReason;
    /** 资产状况说明 */
    private String conditionNote;
}

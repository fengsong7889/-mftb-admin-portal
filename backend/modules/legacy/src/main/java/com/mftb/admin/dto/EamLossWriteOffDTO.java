package com.mftb.admin.dto;

import lombok.Data;

/**
 * 遗失核销请求 DTO
 */
@Data
public class EamLossWriteOffDTO {

    /** 核销日期 yyyy-MM-dd */
    private String writeOffDate;

    /** 核销原因 */
    private String writeOffReason;

    /** 凭证 Data URL（可选） */
    private String evidenceDataUrl;

    /** 凭证文件名（可选） */
    private String evidenceFileName;
}

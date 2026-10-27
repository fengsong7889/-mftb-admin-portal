package com.mftb.admin.dto;

import lombok.Data;

/**
 * 登记找回请求 DTO
 */
@Data
public class EamLossRecoverDTO {

    /** 实际找回日期 yyyy-MM-dd */
    private String recoveredDate;

    /** 找回地点 */
    private String recoveredLocation;

    /** 找回说明 */
    private String recoveredNote;

    /** 凭证 Data URL（可选） */
    private String evidenceDataUrl;

    /** 凭证文件名（可选） */
    private String evidenceFileName;
}

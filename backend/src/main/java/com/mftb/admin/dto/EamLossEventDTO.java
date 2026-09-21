package com.mftb.admin.dto;

import lombok.Data;

/**
 * 遗失跟进事件 DTO
 */
@Data
public class EamLossEventDTO {

    /** 事件描述 */
    private String eventDesc;

    /** 凭证 Data URL（可选） */
    private String evidenceDataUrl;

    /** 凭证文件名（可选） */
    private String evidenceFileName;
}

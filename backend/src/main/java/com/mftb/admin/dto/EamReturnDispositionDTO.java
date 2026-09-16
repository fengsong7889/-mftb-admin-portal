package com.mftb.admin.dto;

import lombok.Data;

/**
 * 归还处置登记请求 DTO
 */
@Data
public class EamReturnDispositionDTO {
    /** 归还记录 ID */
    private Long returnId;
    /** 处置结果：idle/scrapped/written_off */
    private String disposition;
    /** 处置日期 yyyy-MM-dd */
    private String dispositionDate;
    /** 处置凭证 Data URL */
    private String evidenceDataUrl;
    /** 处置凭证文件名 */
    private String evidenceFileName;
}

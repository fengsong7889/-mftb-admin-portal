package com.mftb.admin.dto;

import lombok.Data;

/**
 * 验收处置请求 DTO
 */
@Data
public class EamLossInspectDTO {

    /** 验收结果：normal（正常归位）/ damaged（转维修）/ scrapped（实物报废） */
    private String inspectionResult;

    /** 验收日期 yyyy-MM-dd */
    private String inspectionDate;

    /** 验收说明 */
    private String inspectionNote;

    /* ---- 正常归位时必填 ---- */

    /** 接收管理部门 */
    private String receiveDepartment;

    /** 接收位置 ID */
    private Long receiveLocationId;

    /** 凭证 Data URL（可选） */
    private String evidenceDataUrl;

    /** 凭证文件名（可选） */
    private String evidenceFileName;
}

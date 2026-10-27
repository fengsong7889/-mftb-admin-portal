package com.mftb.admin.dto;

import lombok.Data;

/** 盘点明细提交 DTO（单条资产的盘点结果） */
@Data
public class EamInventorySubmitItemDTO {

    /** 资产 ID */
    private Long assetId;

    /** 盘点状态：normal/lost/damaged */
    private String status;

    /** 备注 */
    private String remark;
}

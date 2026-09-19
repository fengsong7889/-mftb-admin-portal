package com.mftb.admin.dto;

import lombok.Data;

/** 盘点明细视图对象 */
@Data
public class EamInventoryItemVO {

    private Long id;

    /** 关联盘点任务 ID */
    private Long taskId;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号 */
    private String assetNo;

    /** 资产名称 */
    private String assetName;

    /** 资产分类 */
    private String assetType;

    /** 存放位置 */
    private String location;

    /** 盘点状态：pending/normal/lost/damaged */
    private String status;

    /** 备注 */
    private String remark;

    private String createdAt;

    private String updatedAt;
}

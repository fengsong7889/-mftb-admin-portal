package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产盘点明细实体
 */
@Data
@TableName("biz_eam_inventory_item")
public class EamInventoryItem {

    @TableId
    private Long id;

    /** 关联盘点任务 ID */
    private Long taskId;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号（快照） */
    private String assetNo;

    /** 资产名称（快照） */
    private String assetName;

    /** 资产分类（快照） */
    private String assetType;

    /** 存放位置（快照） */
    private String location;

    /** 盘点状态：pending/normal/lost/damaged */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

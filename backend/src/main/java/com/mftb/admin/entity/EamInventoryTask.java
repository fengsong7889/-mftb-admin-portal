package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产盘点任务实体
 */
@Data
@TableName("biz_eam_inventory_task")
public class EamInventoryTask {

    @TableId
    private Long id;

    /** 盘点任务编号（PD+YYYYMMDD+4位） */
    private String taskNo;

    /** 盘点任务名称 */
    private String taskName;

    /** 盘点日期 */
    private String inventoryDate;

    /** 盘点人 */
    private String operator;

    /** 应盘数量 */
    private Integer expectedCount;

    /** 实盘数量 */
    private Integer actualCount;

    /** 差异数（实盘-应盘） */
    private Integer diffCount;

    /** 状态：in_progress/completed/cancelled */
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

    @TableLogic
    private Integer deleted;
}

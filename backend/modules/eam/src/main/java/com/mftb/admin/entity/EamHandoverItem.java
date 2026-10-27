package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产交接单明细实体
 */
@Data
@TableName("biz_eam_handover_item")
public class EamHandoverItem {

    @TableId
    private Long id;

    /** 关联交接单 ID */
    private Long handoverId;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号快照 */
    private String assetNo;

    /** 资产名称快照 */
    private String assetName;

    /** 资产分类快照 */
    private String assetType;

    /** 交接前部门 */
    private String oldDepartment;

    /** 交接后部门 */
    private String newDepartment;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 耗材分类实体（独立于资产分类 biz_eam_category）
 */
@Data
@TableName("biz_consumable_category")
public class ConsumableCategory {

    @TableId
    private Long id;

    /** 分类编码（唯一） */
    private String code;

    /** 分类名称 */
    private String name;

    /** 父分类 ID（0=顶级） */
    private Long parentId;

    /** 排序 */
    private Integer sortOrder;

    /** 状态：enabled/disabled */
    private String status;

    /** 备注 */
    private String remark;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 耗材计量单位字典实体
 */
@Data
@TableName("biz_consumable_unit")
public class ConsumableUnit {

    @TableId
    private Long id;

    /** 单位名称（如：個、盒） */
    private String name;

    /** 缩写（如：pcs、box） */
    private String abbr;

    /** 排序 */
    private Integer sortOrder;

    /** 状态：enabled/disabled */
    private String status;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 分类配件配置实体（同分类下所有产品共用，验收时可一键带入）
 */
@Data
@TableName("biz_eam_category_accessory")
public class EamCategoryAccessory {

    @TableId
    private Long id;

    /** 所属分类编码 */
    private String categoryCode;

    /** 配件名称 */
    private String name;

    /** 默认数量 */
    private Integer defaultQty;

    /** 排序（越小越靠前） */
    private Integer sort;

    /** 状态：1=启用, 0=停用 */
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

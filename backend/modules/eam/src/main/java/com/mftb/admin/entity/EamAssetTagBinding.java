package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产-标签绑定关系实体
 * <p>
 * 多对多关联：每个资产可绑定多个标签（1 个主标签 + N 个次标签），
 * 每个标签可绑定到多个资产。
 * 唯一约束 uk_asset_tag 保证同一资产不会重复绑定同一标签。
 */
@Data
@TableName("biz_eam_asset_tag_binding")
public class EamAssetTagBinding {

    @TableId
    private Long id;

    /** 关联资产ID */
    private Long assetId;

    /** 关联标签模板ID */
    private Long tagId;

    /** 是否主标签：1=是，0=否（每个资产至多 1 个主标签） */
    private Integer isPrimary;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}

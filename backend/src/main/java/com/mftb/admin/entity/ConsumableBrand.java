package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 耗材品牌实体（独立于资产品牌 biz_eam_brand，含 category_type 标记）
 */
@Data
@TableName("biz_consumable_brand")
public class ConsumableBrand {

    @TableId
    private Long id;

    /** 品牌名称 */
    private String name;

    /** 英文名 */
    private String nameEn;

    /** 适用类别：ASSET / CONSUMABLE / BOTH */
    private String categoryType;

    /** 品牌 Logo URL */
    private String logo;

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

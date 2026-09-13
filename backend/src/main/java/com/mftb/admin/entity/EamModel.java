package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 产品型号库实体
 */
@Data
@TableName("biz_eam_model")
public class EamModel {

    @TableId
    private Long id;

    /** 所属分类编码 */
    private String categoryCode;

    /** 所属品牌 ID */
    private Long brandId;

    /** 品牌中文（冗余） */
    private String brandZh;

    /** 品牌英文（冗余） */
    private String brandEn;

    /** 品牌 LOGO（冗余） */
    private String brandLogo;

    /** 产品型号编码 */
    private String modelNo;

    /** 产品名称 */
    private String name;

    /** 计量单位 */
    private String unit;

    /** 参考单价（澳门元） */
    private BigDecimal refPrice;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

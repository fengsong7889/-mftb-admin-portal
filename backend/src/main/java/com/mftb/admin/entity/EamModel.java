package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 產品型號庫實體
 */
@Data
@TableName("biz_eam_model")
public class EamModel {

    @TableId
    private Long id;

    /** 所屬分類編碼 */
    private String categoryCode;

    /** 所屬品牌 ID */
    private Long brandId;

    /** 品牌中文（冗餘） */
    private String brandZh;

    /** 品牌英文（冗餘） */
    private String brandEn;

    /** 品牌 LOGO（冗餘） */
    private String brandLogo;

    /** 產品型號編碼 */
    private String modelNo;

    /** 產品名稱 */
    private String name;

    /** 計量單位 */
    private String unit;

    /** 參考單價（澳門元） */
    private BigDecimal refPrice;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

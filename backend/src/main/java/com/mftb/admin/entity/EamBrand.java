package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 品牌庫實體
 */
@Data
@TableName("biz_eam_brand")
public class EamBrand {

    @TableId
    private Long id;

    /** 所屬分類編碼 */
    private String categoryCode;

    /** 品牌中文 */
    private String brandZh;

    /** 品牌英文 */
    private String brandEn;

    /** 品牌 LOGO URL */
    private String brandLogo;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

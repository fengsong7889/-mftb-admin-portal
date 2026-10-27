package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产/耗材品牌产品库（统一）
 */
@Data
@TableName("biz_eam_brand")
public class EamBrand {

    @TableId
    private Long id;

    /** 品牌编码（AB 前缀，如 AB01） */
    private String code;

    /** 所属分类编码 */
    private String categoryCode;

    /** 资产品牌中文 */
    private String brandZh;

    /** 资产品牌英文 */
    private String brandEn;

    /** 资产品牌 LOGO URL */
    private String brandLogo;

    /** 业务类型：ASSET-资产, CONSUMABLE-耗材 */
    private String bizType;

    /** 状态：enabled / disabled */
    private String status;

    /** 备注 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

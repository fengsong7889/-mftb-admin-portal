package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 耗材主数据实体（SKU 级，数量型管理，区别于单件化资产台账）
 */
@Data
@TableName("biz_eam_consumable_item")
public class EamConsumableItem {

    @TableId
    private Long id;

    /** 耗材编码（HC+6位全局自增，系统生成） */
    private String itemCode;

    /** 耗材名称 */
    private String name;

    /** 分类 ID（biz_eam_category） */
    private Long categoryId;

    /** 分类编码快照 */
    private String categoryCode;

    /** 分类名称快照 */
    private String categoryName;

    /** 耗材分类 ID（biz_consumable_category，独立于资产分类） */
    private Long consumableCategoryId;

    /** 耗材品牌 ID（biz_consumable_brand） */
    private Long brandId;

    /** 品牌 */
    private String brand;

    /** 规格型号 */
    private String spec;

    /** 计量单位（个/盒/包/箱/支） */
    private String unit;

    /** 参考单价 */
    private BigDecimal refPrice;

    /** 图片（Data URL） */
    private String image;

    /** 安全库存下限（0=不预警） */
    private Integer safetyStock;

    /** 库存上限（0=不限） */
    private Integer maxStock;

    /** 单人单次限领量（0=不限） */
    private Integer perClaimLimit;

    /** 状态：enabled/disabled */
    private String status;

    /** 备注 */
    private String remark;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

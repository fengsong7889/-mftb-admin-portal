package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 金字招牌标签计价明细实体
 */
@Data
@TableName("biz_ad_pricing_signboard_label")
public class AdPricingSignboardLabel {

    @TableId
    private Long id;

    /** 计价主表ID（biz_ad_pricing_signboard.id） */
    private Long pricingId;

    /** 标签类型（hot/popular/sales/rating/repurchase/favorites/customers） */
    private String labelType;

    /** 场景（all_macau=全澳對比, district=商圈對比, NULL=統計類無場景） */
    private String scenario;

    /** 是否启用: 1=启用 0=禁用 */
    private Integer enabled;

    /** 标签日单价（MOP/天） */
    private BigDecimal price;

    /** 梯度折扣JSON [{"minDays":3,"discount":95}] */
    private String discountTiers;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

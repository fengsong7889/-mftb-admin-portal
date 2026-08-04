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
 * 盘活复苏商圈计价明细实体（差异层，分商圈定价）
 */
@Data
@TableName("biz_ad_pricing_revive_region")
public class AdPricingReviveRegion {

    @TableId
    private Long id;

    /** 计价主表ID（biz_ad_pricing_revive.id） */
    private Long pricingId;

    /** 商圈: 1=黑沙环区 ... 11=黑沙滩区 */
    private Integer region;

    /** 该商圈日单价（MOP） */
    private BigDecimal dailyPrice;

    /** 每天销售个数（库存） */
    private Integer dailySalesLimit;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

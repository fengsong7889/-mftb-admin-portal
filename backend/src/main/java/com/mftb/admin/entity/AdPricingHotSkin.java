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
 * 人气商家皮肤计价明细实体（定价配置里自定义皮肤，每个皮肤一条: 名称+单价）
 */
@Data
@TableName("biz_ad_pricing_hot_skin")
public class AdPricingHotSkin {

    @TableId
    private Long id;

    /** 计价主表ID（biz_ad_pricing_hot.id） */
    private Long pricingId;

    /** 皮肤名称 */
    private String skinName;

    /** 皮肤日单价（MOP） */
    private BigDecimal price;

    /** 边框方式: none=无边框 color=选择配色 image=上传边框图 */
    private String borderType;

    /** 边框颜色(HEX, borderType=color时生效) */
    private String borderColor;

    /** 菜品展示布局: grid=大图拼列 carousel=阶梯轮播（单选） */
    private String dishLayout;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

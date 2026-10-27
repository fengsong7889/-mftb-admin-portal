package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 金字招牌订单明细实体（一行 = 一个「标签 x 日期」格子）
 */
@Data
@TableName("biz_ad_order_item_signboard")
public class AdOrderItemSignboard {

    @TableId
    private Long id;

    /** 订单主表ID（biz_ad_order.id） */
    private Long orderId;

    /** 订单编号快照 */
    private String orderNo;

    /** 投放日期 */
    private LocalDate bizDate;

    /** 标签类型（hot/popular/sales/rating/repurchase/favorites/customers） */
    private String labelType;

    /** 场景（all_macau/district/null，对比类标签有值，统计类为null） */
    private String scenario;

    /** 格子原价（标签日单价） */
    private BigDecimal originalPrice;

    /** 实付分摊价（折扣后） */
    private BigDecimal salePrice;

    /** 已退款金额（取消扣费梯度） */
    private BigDecimal refundPrice;

    /** 投放状态: 1=待投放 2=已投放 3=已退款 */
    private Integer deliveryStatus;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

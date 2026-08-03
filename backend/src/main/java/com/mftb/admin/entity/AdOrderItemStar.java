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
 * 无敌星星订单明细实体（差异层，独家占核心）
 * 一行 = 一个「商圈 x 日期 x 餐段」格子
 */
@Data
@TableName("biz_ad_order_item_star")
public class AdOrderItemStar {

    @TableId
    private Long id;

    /** 订单主表ID（biz_ad_order.id） */
    private Long orderId;

    /** 订单编号快照 */
    private String orderNo;

    /** 投放日期 */
    private LocalDate bizDate;

    /** 商圈 */
    private Integer region;

    /** 餐段时段: breakfast/lunch/afternoon/dinner/supper */
    private String mealSlot;

    /** 格子原价（商圈日单价/5） */
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

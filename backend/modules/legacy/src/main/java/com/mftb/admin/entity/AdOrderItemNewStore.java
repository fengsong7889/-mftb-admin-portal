package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 新店广告订单明细实体（差异层）
 * 一行 = 一个投放日期（无商圈/餐段/定价维度，纯粹使用赠送天数抵扣）
 */
@Data
@TableName("biz_ad_order_item_new_store")
public class AdOrderItemNewStore {

    @TableId
    private Long id;

    /** 订单主表ID（biz_ad_order.id） */
    private Long orderId;

    /** 订单编号快照 */
    private String orderNo;

    /** 投放日期 */
    private LocalDate bizDate;

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

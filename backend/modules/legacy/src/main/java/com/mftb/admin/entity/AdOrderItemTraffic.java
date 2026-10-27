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
 * 投流广告订单明细实体（一个订单一条明细 = 一个流量包）
 * <p>
 * 退款按剩余未消耗曝光折算：退款金额 = 剩余曝光 × 实际单价 × (1 - 手续费比例)，
 * consumedImpressions 由 APP 端投放消耗回写。
 */
@Data
@TableName("biz_ad_order_item_traffic")
public class AdOrderItemTraffic {

    @TableId
    private Long id;

    /** 订单主表ID（biz_ad_order.id） */
    private Long orderId;

    /** 订单编号快照 */
    private String orderNo;

    /** 购买方式: tier=预设档位 custom=自定义数量 */
    private String mode;

    /** 流量包名称（档位购买=档位名，自定义=自定义曝光次数） */
    private String packageName;

    /** 购买曝光次数 */
    private Integer impressions;

    /** 实际单价（MOP/次，实付金额÷购买曝光） */
    private BigDecimal unitPrice;

    /** 投流时段: business=主营时段投流 allday=全天投流 */
    private String deliverySlot;

    /** 订单原价（档位原价/阶梯计价） */
    private BigDecimal originalPrice;

    /** 实付金额（扣除赠送天数抵扣后） */
    private BigDecimal salePrice;

    /** 已退款金额 */
    private BigDecimal refundPrice;

    /** 退款手续费比例快照（%） */
    private Integer refundFeePercent;

    /** 已消耗曝光次数（APP端回写） */
    private Integer consumedImpressions;

    /** 投放状态: 1=投放中 2=已消耗完毕 3=已退款 */
    private Integer deliveryStatus;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

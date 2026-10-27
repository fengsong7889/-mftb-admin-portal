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
 * 秒杀商品统计实体
 */
@Data
@TableName("biz_flash_sale_stats")
public class BizFlashSaleStats {

    @TableId
    private Long id;

    /** 期数ID */
    private Long periodId;

    /** 商品ID */
    private String productId;

    /** 商品名称 */
    private String productName;

    /** 商品门店（多个分号分隔） */
    private String storeNames;

    /** 价格类型: single/tier */
    private String priceType;

    /** 秒杀价（单一价格） */
    private BigDecimal flashSalePrice;

    /** 下单用户 */
    private Integer orderUsers;

    /** 总价 */
    private BigDecimal totalPrice;

    /** 订单总数 */
    private Integer totalOrders;

    /** 商品总销量 */
    private Integer totalSales;

    /** 实付金额 */
    private BigDecimal actualAmount;

    /** 下单用户环比（NULL=无上期数据） */
    private BigDecimal orderUsersChange;

    /** 总价环比 */
    private BigDecimal totalPriceChange;

    /** 订单总数环比 */
    private BigDecimal totalOrdersChange;

    /** 商品总销量环比 */
    private BigDecimal totalSalesChange;

    /** 实付金额环比 */
    private BigDecimal actualAmountChange;

    /** 是否补贴品: ka/procurement/bd_submit/platform/none */
    private String subsidyType;

    /** 折扣率 */
    private BigDecimal discountRate;

    /** 上期有无补贴: 5类/none/none_data=无上期数据 */
    private String lastPeriodSubsidy;

    /** 所属BD */
    private String bdName;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

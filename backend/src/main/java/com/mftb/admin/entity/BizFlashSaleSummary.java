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
 * 秒杀每日汇总实体
 */
@Data
@TableName("biz_flash_sale_summary")
public class BizFlashSaleSummary {

    @TableId
    private Long id;

    /** 期数ID */
    private Long periodId;

    /** 统计日期 */
    private LocalDate statDate;

    /** 总应付金额 */
    private BigDecimal totalPayable;

    /** 总实付金额 */
    private BigDecimal totalActual;

    /** 订单总数 */
    private Integer totalOrders;

    /** 商品总销量 */
    private Integer totalSales;

    /** 总商品数 */
    private Integer totalProducts;

    /** 动销商品数 */
    private Integer soldProducts;

    /** 购买人数(已去重) */
    private Integer buyers;

    /** 复购人数 */
    private Integer repurchaseBuyers;

    /** 复购率 */
    private BigDecimal repurchaseRate;

    /** 人均客单价 */
    private BigDecimal avgOrderValue;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

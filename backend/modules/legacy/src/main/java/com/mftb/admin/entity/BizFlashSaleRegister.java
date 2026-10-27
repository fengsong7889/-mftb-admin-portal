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
 * 秒杀商品登记实体
 */
@Data
@TableName("biz_flash_sale_register")
public class BizFlashSaleRegister {

    @TableId
    private Long id;

    /** 期数ID */
    private Long periodId;

    /** 序号 */
    private Integer seqNo;

    /** 补贴类型: ka/procurement/bd_submit/platform/merchant */
    private String subsidyType;

    /** 门店编码（多个逗号分隔） */
    private String storeCodes;

    /** 门店名称（冗余展示） */
    private String storeNames;

    /** BD姓名（门店-BD 自动带出快照，多个逗号分隔） */
    private String bdNames;

    /** 商品ID */
    private String productId;

    /** 商品名称 */
    private String productName;

    /** 商品类型: tuan_dan=团单, voucher=代金券 */
    private String productType;

    /** 每人最多购买（自由文本） */
    private String maxPurchase;

    /** 价格类型: single=单一价格, tier=阶梯价格 */
    private String priceType;

    /** 原价 */
    private BigDecimal originalPrice;

    /** 团购价 */
    private BigDecimal groupPrice;

    /** 秒杀价（单一价格） */
    private BigDecimal flashSalePrice;

    /** 秒杀库存（单一价格） */
    private Integer flashSaleStock;

    /** 本期秒杀销量（统计导入后回填） */
    private Integer currentSales;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

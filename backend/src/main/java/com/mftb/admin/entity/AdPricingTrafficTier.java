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
 * 投流广告档位明细实体（对应「销售定价 - 投流广告」菜单中的预设档位）
 */
@Data
@TableName("biz_ad_pricing_traffic_tier")
public class AdPricingTrafficTier {

    @TableId
    private Long id;

    /** 计价主表 ID (biz_ad_pricing_traffic.id) */
    private Long pricingId;

    /** 档位名称（如：基础版/标准版/进阶版） */
    private String tierName;

    /** 档位编码 */
    private String tierCode;

    /** 曝光次数 */
    private Integer impressions;

    /** 档位价格 (MOP) */
    private BigDecimal price;

    /** 销售周期（多少天内有效） */
    private Integer sellDays;

    /** 售卖状态：1=在售 2=下架 */
    private Integer onSale;

    /** 排序号（从小到大） */
    private Integer sort;

    /** 备注 */
    private String remark;

    /** 有效天数 */
    private Integer validityDays;

    /** 是否启用折扣：0=否 1=是 */
    private Integer discountEnabled;

    /** 折扣率 */
    private BigDecimal discount;

    /** 折扣时间模式：fixed / custom */
    private String discountTimeMode;

    /** 折扣开始日期 */
    private LocalDate discountStartDate;

    /** 折扣结束日期 */
    private LocalDate discountEndDate;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

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
 * 投流广告阶梯单价实体（对应「销售定价 - 投流广告」菜单中的自定义购买）
 */
@Data
@TableName("biz_ad_pricing_traffic_ladder")
public class AdPricingTrafficLadder {

    @TableId
    private Long id;

    /** 计价主表 ID (biz_ad_pricing_traffic.id) */
    private Long pricingId;

    /** 最低数量（含） */
    private Integer minQty;

    /** 最高数量（含，NULL 表示无上限） */
    private Integer maxQty;

    /** 单价 (MOP/1000 次曝光) */
    private BigDecimal unitPrice;

    /** 排序号（从小到大） */
    private Integer sort;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

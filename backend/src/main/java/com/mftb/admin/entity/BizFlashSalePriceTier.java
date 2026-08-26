package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 秒杀价阶梯实体（登记/统计共用）
 */
@Data
@TableName("biz_flash_sale_price_tier")
public class BizFlashSalePriceTier {

    @TableId
    private Long id;

    /** 归属: register=登记, stats=统计 */
    private String ownerType;

    /** 归属记录ID */
    private Long ownerId;

    /** 阶梯序号（从1开始） */
    private Integer tierNo;

    /** 阶梯价 */
    private BigDecimal tierPrice;

    /** 阶梯库存 */
    private Integer tierStock;

    /** 阶梯补贴（统计来源可为 NULL） */
    private BigDecimal tierSubsidy;
}

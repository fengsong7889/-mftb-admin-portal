package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材入库单明细实体
 */
@Data
@TableName("biz_eam_consumable_inbound_item")
public class EamConsumableInboundItem {

    @TableId
    private Long id;

    /** 入库单ID */
    private Long inboundId;

    /** 耗材ID */
    private Long itemId;

    /** 耗材编码快照 */
    private String itemCode;

    /** 耗材名称快照 */
    private String itemName;

    /** 规格快照 */
    private String spec;

    /** 单位快照 */
    private String unit;

    /** 入库仓库ID */
    private Long locationId;

    /** 仓库名称快照 */
    private String locationName;

    /** 入库数量 */
    private Integer qty;

    /** 实际入库单价 */
    private BigDecimal unitPrice;

    /** 入库成本金额 */
    private BigDecimal amount;

    /** 来源验收明细ID（幂等） */
    private Long sourceLineId;
}

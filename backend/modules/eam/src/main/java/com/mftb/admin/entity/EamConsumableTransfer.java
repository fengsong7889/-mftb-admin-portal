package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 耗材库存调拨单实体（同档案同公司跨仓）
 */
@Data
@TableName("biz_eam_consumable_transfer")
public class EamConsumableTransfer {

    @TableId
    private Long id;

    /** 调拨单号（HCDB+YYYYMMDD+4位） */
    private String transferNo;

    /** 耗材ID */
    private Long itemId;

    /** 调出仓库ID */
    private Long fromLocationId;

    /** 调出仓库名称快照 */
    private String fromLocationName;

    /** 调入仓库ID */
    private Long toLocationId;

    /** 调入仓库名称快照 */
    private String toLocationName;

    /** 调拨数量 */
    private Integer qty;

    /** 调出成本单价 */
    private BigDecimal unitCost;

    /** 调拨成本金额 */
    private BigDecimal amount;

    /** 操作人 */
    private String operator;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}

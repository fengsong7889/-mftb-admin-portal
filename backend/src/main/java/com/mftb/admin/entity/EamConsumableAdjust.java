package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 耗材库存调整单实体（盘盈/盘亏）
 */
@Data
@TableName("biz_eam_consumable_adjust")
public class EamConsumableAdjust {

    @TableId
    private Long id;

    /** 调整单号（HCTZ+YYYYMMDD+4位） */
    private String adjustNo;

    /** 耗材ID */
    private Long itemId;

    /** 仓库ID */
    private Long locationId;

    /** 仓库名称快照 */
    private String locationName;

    /** 调整方向：in=盘盈/out=盘亏 */
    private String direction;

    /** 调整数量（正整数） */
    private Integer qty;

    /** 调整单价 */
    private BigDecimal unitCost;

    /** 调整金额 */
    private BigDecimal amount;

    /** 调整原因 */
    private String reason;

    /** 操作人 */
    private String operator;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}

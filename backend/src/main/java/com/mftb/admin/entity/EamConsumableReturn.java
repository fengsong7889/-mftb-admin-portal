package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 耗材退料单实体
 */
@Data
@TableName("biz_eam_consumable_return")
public class EamConsumableReturn {

    @TableId
    private Long id;

    /** 退料单号（HCTL+YYYYMMDD+4位） */
    private String returnNo;

    /** 原领用单ID */
    private Long claimId;

    /** 原领用明细ID */
    private Long claimItemId;

    /** 耗材ID */
    private Long itemId;

    /** 退回仓库ID */
    private Long locationId;

    /** 仓库名称快照 */
    private String locationName;

    /** 退料数量 */
    private Integer qty;

    /** 退回单价（原出库均价） */
    private BigDecimal unitCost;

    /** 退回成本金额 */
    private BigDecimal amount;

    /** 原领用人ID */
    private Long applicantId;

    /** 原领用人姓名 */
    private String applicantName;

    /** 承担部门ID */
    private Long departmentId;

    /** 承担部门名称 */
    private String department;

    /** 退料原因 */
    private String reason;

    /** 操作人 */
    private String operator;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}

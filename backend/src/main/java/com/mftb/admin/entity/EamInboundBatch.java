package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 驗收入庫批次實體
 */
@Data
@TableName("biz_eam_inbound_batch")
public class EamInboundBatch {

    @TableId
    private Long id;

    /** 批次編號 */
    private String batchNo;

    /** 關聯採購訂單 ID */
    private Long poId;

    /** 採購訂單號（冗餘） */
    private String poNo;

    /** 驗收日期 */
    private String inboundDate;

    /** 操作人 */
    private String operator;

    /** 入庫總數 */
    private Integer totalQty;

    /** 已驗收數量 */
    private Integer acceptedQty;

    /** 未驗收數量 */
    private Integer pendingQty;

    /** 退貨數量 */
    private Integer returnQty;

    /** 換貨數量 */
    private Integer exchangeQty;

    /** 讓步接收數量 */
    private Integer concessionQty;

    /** 採購事由 */
    private String purchaseReason;

    /** 備註 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

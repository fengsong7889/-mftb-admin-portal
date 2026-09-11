package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 採購訂單實體
 */
@Data
@TableName("biz_eam_purchase_order")
public class EamPurchaseOrder {

    @TableId
    private Long id;

    /** 訂單編號 */
    private String poNo;

    /** 關聯採購申請 ID（0=直接下單） */
    private Long reqId;

    /** 供應商（兼容舊數據） */
    private String supplier;

    /** 訂單金額（預估） */
    private BigDecimal amount;

    /** 實際成交金額 */
    private BigDecimal confirmedAmount;

    /** 預計交貨日期 */
    private String deliveryDate;

    /** 採購經辦人 */
    private String purchaser;

    /** 服務部門（持久化） */
    private String department;

    /** 採購事由/備註 */
    private String remark;

    /** 快遞單號（兼容舊數據） */
    private String trackingNo;

    /** 供應商聯絡人（兼容舊數據） */
    private String contact;

    /** 下單日期（兼容舊數據） */
    private String orderDate;

    /** 執行狀態：pending/purchasing/completed */
    private String execStatus;

    /** 驗收狀態：pending/partial/received */
    private String status;

    /** 已驗收總數 */
    private Integer acceptedQty;

    /** 退貨總數 */
    private Integer returnQty;

    /** 換貨總數 */
    private Integer exchangeQty;

    /** 讓步接收總數 */
    private Integer concessionQty;

    /** 供應商分組 JSON */
    private String supplierGroups;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 采购订单实体
 */
@Data
@TableName("biz_eam_purchase_order")
public class EamPurchaseOrder {

    @TableId
    private Long id;

    /** 订单编号 */
    private String poNo;

    /** 关联采购申请 ID（0=直接下单） */
    private Long reqId;

    /** 供应商（兼容旧数据） */
    private String supplier;

    /** 订单金额（预估） */
    private BigDecimal amount;

    /** 实际成交金额 */
    private BigDecimal confirmedAmount;

    /** 预计交货日期 */
    private String deliveryDate;

    /** 采购经办人 */
    private String purchaser;

    /** 服务部门（持久化） */
    private String department;

    /** 采购事由/备注 */
    private String remark;

    /** 快递单号（兼容旧数据） */
    private String trackingNo;

    /** 供应商联络人（兼容旧数据） */
    private String contact;

    /** 下单日期（兼容旧数据） */
    private String orderDate;

    /** 执行状态：pending/purchasing/completed */
    private String execStatus;

    /** 验收状态：pending/partial/received */
    private String status;

    /** 已验收总数 */
    private Integer acceptedQty;

    /** 退货总数 */
    private Integer returnQty;

    /** 换货总数 */
    private Integer exchangeQty;

    /** 让步接收总数 */
    private Integer concessionQty;

    /** 供应商分组 JSON */
    private String supplierGroups;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

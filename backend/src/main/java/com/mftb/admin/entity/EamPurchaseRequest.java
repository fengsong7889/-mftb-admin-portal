package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 采购申请实体
 */
@Data
@TableName("biz_eam_purchase_request")
public class EamPurchaseRequest {

    @TableId
    private Long id;

    /** 申请编号 */
    private String reqNo;

    /** 关联 OA 流程编号 */
    private String flowNo;

    /** 申请标题 */
    private String title;

    /** 申请部门 */
    private String department;

    /** 申请部门 ID */
    private Long departmentId;

    /** 申请人 */
    private String applicant;

    /** 申请人工号 */
    private String applicantEmpId;

    /** 采购事由 */
    private String reason;

    /** 预算金额 */
    private BigDecimal budget;

    /** pending/approved/rejected */
    private String status;

    /** 审批通过后生成的采购订单 ID */
    private Long orderId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

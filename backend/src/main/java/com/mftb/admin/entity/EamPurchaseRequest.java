package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 採購申請實體
 */
@Data
@TableName("biz_eam_purchase_request")
public class EamPurchaseRequest {

    @TableId
    private Long id;

    /** 申請編號 */
    private String reqNo;

    /** 關聯 OA 流程編號 */
    private String flowNo;

    /** 申請標題 */
    private String title;

    /** 申請部門 */
    private String department;

    /** 申請部門 ID */
    private Long departmentId;

    /** 申請人 */
    private String applicant;

    /** 申請人工號 */
    private String applicantEmpId;

    /** 採購事由 */
    private String reason;

    /** 預算金額 */
    private BigDecimal budget;

    /** pending/approved/rejected */
    private String status;

    /** 審批通過後生成的採購訂單 ID */
    private Long orderId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

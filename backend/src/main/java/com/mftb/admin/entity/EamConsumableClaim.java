package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 耗材领用单实体（申请 → 审批 → 出库核销，无归还流程）
 */
@Data
@TableName("biz_eam_consumable_claim")
public class EamConsumableClaim {

    @TableId
    private Long id;

    /** 领用单号（HCLY+YYYYMMDD+4位） */
    private String claimNo;

    /** 申请人 ID（sys_user.id） */
    private Long applicantId;

    /** 申请人姓名快照 */
    private String applicantName;

    /** 申请人工号 */
    private String applicantEmpId;

    /** 申请部门 */
    private String department;

    /** 领用事由 */
    private String reason;

    /** 状态：pending/approved/rejected/issued/cancelled */
    private String status;

    /** 审批人 ID */
    private Long approverId;

    /** 审批人姓名 */
    private String approverName;

    /** 审批时间 */
    private LocalDateTime approvedAt;

    /** 审批意见 */
    private String approveRemark;

    /** 出库操作人 ID */
    private Long issueOperatorId;

    /** 出库操作人姓名 */
    private String issueOperator;

    /** 出库时间 */
    private LocalDateTime issuedAt;

    /** 取消原因 */
    private String cancelReason;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

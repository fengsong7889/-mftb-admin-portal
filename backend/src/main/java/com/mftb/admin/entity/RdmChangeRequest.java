package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * RDM 需求变更申请实体（走 OA 审批）。
 * <p>已受理需求的范围/排期/验收标准变更必须留痕，避免口头改需求导致返工无从追责。
 */
@Data
@TableName("rdm_change_request")
public class RdmChangeRequest {

    @TableId
    private Long id;

    /** 变更编号 XC+YYYYMMDD+4位 */
    private String changeNo;

    /** 业务需求ID */
    private Long reqId;

    /** 受影响 PRD */
    private Long prdId;

    /** 变更类型: scope/schedule/criterion/priority/other */
    private String changeType;

    /** 变更前快照（JSON） */
    private String beforeSnapshot;

    /** 变更后内容 */
    private String afterContent;

    /** 变更原因 */
    private String reason;

    /** 影响说明 */
    private String impactDesc;

    /** 是否影响排期 */
    private Integer affectsScheduleFlag;

    /** 增加工时 */
    private BigDecimal addedHours;

    /** 关联 OA 审批流程编号 */
    private String flowNo;

    /** 审批状态: pending/approved/rejected/cancelled */
    private String approvalStatus;

    /** 申请人ID */
    private Long applicantUserId;

    /** 申请人姓名 */
    private String applicantName;

    /** 申请时间 */
    private LocalDateTime applyTime;

    /** 审批时间 */
    private LocalDateTime decideTime;

    /** 审批意见 */
    private String decideRemark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

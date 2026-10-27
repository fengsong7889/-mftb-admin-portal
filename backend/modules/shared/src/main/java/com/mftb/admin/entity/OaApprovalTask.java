package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OA审批任务实体（每个审批节点一条记录）
 */
@Data
@TableName("biz_oa_approval_task")
public class OaApprovalTask {

    @TableId
    private Long id;

    /** 关联流程实例ID */
    private Long requestId;

    /** 审批节点名称 */
    private String nodeName;

    /** 节点顺序 */
    private Integer sortOrder;

    /** 审批规则: any=或签 / all=会签 */
    private String approvalRule;

    /** 审批人 */
    private String approver;

    /** 任务状态: pending/approved/rejected */
    private String taskStatus;

    /** 审批时间 */
    private LocalDateTime approveTime;

    /** 审批意见 */
    private String comment;

    /** 已审批人列表（逗号分隔，会签模式多人追加） */
    private String approvedBy;

    /** 已审批时间列表（逗号分隔，与 approvedBy 一一对应） */
    private String approvedTimes;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

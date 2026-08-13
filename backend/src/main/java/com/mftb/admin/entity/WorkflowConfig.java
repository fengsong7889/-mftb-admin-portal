package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 流程配置实体（控制各业务流程是否需要审批）
 */
@Data
@TableName("biz_workflow_config")
public class WorkflowConfig {

    @TableId
    private Long id;

    /** 流程类型标识: recharge/deduct/transfer/merge/gift */
    private String flowType;

    /** 流程展示名称 */
    private String flowName;

    /** 审批开关: 1=启用审批, 0=停用(直接执行) */
    private Integer approvalEnabled;

    /** 流程说明 */
    private String description;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("ai_access_request")
public class AiAccessRequest {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long applicantId;
    private String applicantName;
    private Long departmentId;
    private String departmentName;
    private Long positionId;
    private String positionName;

    private String requestType;
    private String requestedModels;
    private String usageDescription;
    /** 使用場景 JSON 數組 */
    private String usageScenarios;
    /** 使用頻率: occasional/regular/heavy */
    private String usageFrequency;

    private String status;
    private Long workflowInstanceId;

    private String approvedModels;
    private String approvedQuotaType;
    private BigDecimal approvedQuotaValue;
    private String approvedQuotaPeriod;
    private String approvedOverLimitAction;

    private Long approverId;
    private String approverName;
    private String approveRemark;
    private LocalDateTime approvedAt;

    private String createdBy;
    private String updatedBy;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

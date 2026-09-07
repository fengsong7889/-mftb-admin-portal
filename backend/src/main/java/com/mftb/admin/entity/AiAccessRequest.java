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
    /** 申請場景入口: no-models/no-quota/no-both/topup/add-model/quota-exhausted/needs-approval */
    private String applyReason;
    private String requestedModels;
    private String usageDescription;
    /** 使用場景 JSON 數組 */
    private String usageScenarios;
    /** 使用頻率: occasional/regular/heavy */
    private String usageFrequency;
    /** 申請憑證附件 JSON 數組 [{name,type,size,dataUrl}] */
    private String credentials;

    private String status;
    private Long workflowInstanceId;

    private String approvedModels;
    /** 授權模型能力配置 JSON 數組 [{modelId,visionSupport,functionCalling,jsonMode,streaming,thinkingMode}] */
    private String approvedModelConfigs;
    private String approvedQuotaType;
    private BigDecimal approvedQuotaValue;
    private String approvedQuotaPeriod;
    private String approvedOverLimitAction;
    /** 額度生效類型: permanent=永久 temporary=臨時 */
    private String quotaEffectiveType;
    /** 臨時額度到期時間 */
    private LocalDateTime quotaExpireAt;

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

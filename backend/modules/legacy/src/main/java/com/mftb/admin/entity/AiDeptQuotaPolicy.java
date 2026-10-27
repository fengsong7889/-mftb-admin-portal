package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 部门配额策略实体（按部门维度授予模型额度）
 */
@Data
@TableName("ai_dept_quota_policy")
public class AiDeptQuotaPolicy {

    @TableId(type = IdType.AUTO)
    private Long id;
    /** 配置ID（按编号生成规则 ai_dept_quota 生成，如 BMED20260906000） */
    private String configCode;
    private String name;
    private String description;
    /** JSON 序列化：部门 ID 数组 */
    private String deptIds;
    /** JSON 序列化：部门名称数组 */
    private String deptNames;
    private Integer totalEmployeeCount;
    private String allocateMode;
    private String period;
    private String quotaType;
    private BigDecimal quotaValue;
    private String currency;
    private Integer softThreshold;
    private String overLimitAction;
    private Long downgradeModelId;
    private BigDecimal downgradeExemptQuota;
    private BigDecimal usedValue;
    private Integer status;

    @TableLogic
    private Integer deleted;
    private String createdBy;
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("ai_dept_quota_policy")
public class AiDeptQuotaPolicy {

    @TableId(type = IdType.AUTO)
    private Long id;
    /** 配置ID（按编号生成规则 ai_dept_quota 生成，如 BMED20260906000） */
    private String configCode;
    private String name;
    private String description;
    /** JSON 序列化：部門 ID 數組 */
    private String deptIds;
    /** JSON 序列化：部門名稱數組 */
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

package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 员工职位额度策略
 */
@Data
@TableName("ai_emp_quota_policy")
public class AiEmpQuotaPolicy {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 配置ID（按编号生成规则 ai_emp_pos_quota 生成，如 ZWED202609000） */
    private String configCode;

    /** 策略名称 */
    private String name;

    /** 策略描述 */
    private String description;

    /** 职级序列 JSON 数组 */
    private String sequences;

    /** 职级 JSON 数组 */
    private String jobLevels;

    /** 覆盖人数 */
    private Integer totalEmployeeCount;

    /** 限额周期: daily/monthly */
    private String period;

    /** 限额类型: token/cost/request */
    private String quotaType;

    /** 限额值 */
    private BigDecimal quotaValue;

    /** 计价币种 */
    private String currency;

    /** 软限额提醒阈值(%) */
    private Integer softThreshold;

    /** 超额动作: reject/approve/downgrade */
    private String overLimitAction;

    /** 降级目标模型ID */
    private Long downgradeModelId;

    /** 降级豁免额度 */
    private BigDecimal downgradeExemptQuota;

    /** 本期已用量 */
    private BigDecimal usedValue;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    /** 创建人 */
    private String createdBy;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

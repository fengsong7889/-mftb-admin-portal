package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 員工職位額度策略
 */
@Data
@TableName("ai_emp_quota_policy")
public class AiEmpQuotaPolicy {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 配置ID（按编号生成规则 ai_emp_pos_quota 生成，如 ZWED202609000） */
    private String configCode;

    /** 策略名稱 */
    private String name;

    /** 策略描述 */
    private String description;

    /** 職級序列 JSON 數組 */
    private String sequences;

    /** 職級 JSON 數組 */
    private String jobLevels;

    /** 覆蓋人數 */
    private Integer totalEmployeeCount;

    /** 限額周期: daily/monthly */
    private String period;

    /** 限額類型: token/cost/request */
    private String quotaType;

    /** 限額值 */
    private BigDecimal quotaValue;

    /** 計價幣種 */
    private String currency;

    /** 軟限額提醒閾值(%) */
    private Integer softThreshold;

    /** 超額動作: reject/approve/downgrade */
    private String overLimitAction;

    /** 降級目標模型ID */
    private Long downgradeModelId;

    /** 本期已用量 */
    private BigDecimal usedValue;

    /** 狀態: 1=啟用 0=停用 */
    private Integer status;

    /** 邏輯刪除 */
    @TableLogic
    private Integer deleted;

    /** 創建人 */
    private String createdBy;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

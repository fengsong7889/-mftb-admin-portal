package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 員工角色額度策略
 */
@Data
@TableName("ai_role_quota_policy")
public class AiRoleQuotaPolicy {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 配置ID（按编号生成规则 ai_emp_role_quota 生成，如 JSED20260906000） */
    private String configCode;

    /** 角色名稱 */
    private String roleName;

    /** 角色描述 */
    private String description;

    /** 綁定員工ID JSON 數組 */
    private String userIds;

    /** 綁定員工姓名 JSON 數組 */
    private String userNames;

    /** 綁定人數 */
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

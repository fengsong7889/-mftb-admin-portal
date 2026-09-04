package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 部门/员工额度配置实体
 */
@Data
@TableName("ai_quota_config")
public class AiQuotaConfig {

    @TableId
    private Long id;

    /** 配额类型：department/employee */
    private String quotaType;

    /** 目标 ID（部门 ID 或员工 ID） */
    private Long targetId;

    /** 模型 ID（NULL=全局配额） */
    private Long modelId;

    /** 每日配额（tokens） */
    private Integer dailyQuota;

    /** 月度配额（tokens） */
    private Integer monthlyQuota;

    /** 今日已用 */
    private Long usedToday;

    /** 本月已用 */
    private Long usedMonth;

    /** 配额周期开始日期 */
    private LocalDate quotaPeriodStart;

    /** 配额周期结束日期 */
    private LocalDate quotaPeriodEnd;

    /** 是否自动重置：1=是 0=否 */
    private Integer autoReset;

    /** 每月重置日（1-31） */
    private Integer resetDayOfMonth;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

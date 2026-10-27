package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 员工额度调整日志实体
 *
 * 记录管理员对员工额度的人工调整操作（旧值→新值+原因+操作人），
 * 供详情页调整历史展示。
 */
@Data
@TableName("ai_emp_quota_adjust_log")
public class AiEmpQuotaAdjustLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 被调整员工ID (sys_user.id) */
    private Long employeeId;

    /** 来源维度: department/position/role/approval */
    private String source;

    /** 来源描述 */
    private String sourceDesc;

    /** 限额类型: token/request/cost */
    private String quotaType;

    /** 限额周期: daily/monthly */
    private String quotaPeriod;

    /** 调整前值 */
    private BigDecimal oldValue;

    /** 调整后值 */
    private BigDecimal newValue;

    /** 调整原因 */
    private String reason;

    /** 操作人 */
    private String operator;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}

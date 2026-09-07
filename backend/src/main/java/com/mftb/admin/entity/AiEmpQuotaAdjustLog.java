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
 * 員工額度調整日誌實體
 *
 * 記錄管理員對員工額度的人工調整操作（舊值→新值+原因+操作人），
 * 供詳情頁調整歷史展示。
 */
@Data
@TableName("ai_emp_quota_adjust_log")
public class AiEmpQuotaAdjustLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 被調整員工ID (sys_user.id) */
    private Long employeeId;

    /** 來源維度: department/position/role/approval */
    private String source;

    /** 來源描述 */
    private String sourceDesc;

    /** 限額類型: token/request/cost */
    private String quotaType;

    /** 限額週期: daily/monthly */
    private String quotaPeriod;

    /** 調整前值 */
    private BigDecimal oldValue;

    /** 調整後值 */
    private BigDecimal newValue;

    /** 調整原因 */
    private String reason;

    /** 操作人 */
    private String operator;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}

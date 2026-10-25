package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 人員參保記錄（表 payroll_enrollment）：某段雇傭參加了哪個方案、按什么基数、每月各扣多少。
 * <p>
 * 为什么存金额快照而不是每次按方案费率现算：费率会调、历史工资单必须能重现，
 * 所以参保时把当时的基数与雇主/雇员金额一起定下来（与薪酬标准同一思路）。
 */
@Data
@TableName("payroll_enrollment")
public class PayrollEnrollment {

    @TableId
    private Long id;

    /** 雇傭關係 ID */
    private Long employmentId;

    /** 參保方案 ID */
    private Long planId;

    /** 繳費基數 */
    private BigDecimal baseAmount;

    /** 雇員每月扣除額 */
    private BigDecimal employeeAmount;

    /** 雇主每月承擔額 */
    private BigDecimal employerAmount;

    /** 幣種（快照方案幣種） */
    private String currency;

    /** 生效起（含） */
    private LocalDate effectiveFrom;

    /** 生效止（含），空表示在保 */
    private LocalDate effectiveTo;

    /** 同日序號 */
    private Integer seqNo;

    /** 停保原因 */
    private String stopReason;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

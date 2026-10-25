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
 * 薪酬标准（表 payroll_salary_standard）：某段雇佣在某段时间的基本工资。
 * <p>
 * 日期生效而不是"当前工资一个字段"：调薪必须能回答"2026-09 他在拿多少"，
 * 覆盖式更新会让历史工资单无法重现（方案 6.1：历史工资锁定规则版本与输入快照）。
 * <p>
 * 金额一律 DECIMAL(18,4) 且强制带币种：float 与"无币种金额"在跨境汇总时必然错。
 */
@Data
@TableName("payroll_salary_standard")
public class PayrollSalaryStandard {

    @TableId
    private Long id;

    /** 雇佣关系 ID（薪资挂在雇佣上，不直接挂人：同一人可能多法人并行） */
    private Long employmentId;

    /** 基本工资 */
    private BigDecimal baseAmount;

    /** 币种 ISO 4217（CNY/HKD/MOP） */
    private String currency;

    /** 变更类型：HIRE 入职定薪 / ADJUST 调薪 / PROMOTION 晋升调薪 / ANNUAL 年度调薪 */
    private String changeType;

    /** 生效起（含） */
    private LocalDate effectiveFrom;

    /** 生效止（含）；为空表示当前有效 */
    private LocalDate effectiveTo;

    /** 同日序号：同一天多次定调薪按此排序 */
    private Integer seqNo;

    /** 调薪原因 */
    private String reason;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

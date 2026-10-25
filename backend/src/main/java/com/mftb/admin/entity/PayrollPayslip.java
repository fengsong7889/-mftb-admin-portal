package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 工资单（表 payroll_payslip）：批次里某个雇佣的一张单。
 * <p>
 * 金额字段是结果快照，不是视图计算结果：工资单一经生成就必须能原样重放，
 * 不能因为后来调了薪酬标准或社保费率而变。
 */
@Data
@TableName("payroll_payslip")
public class PayrollPayslip {

    @TableId
    private Long id;

    /** 所属批次 */
    private Long runId;

    /** 雇佣关系 */
    private Long employmentId;

    /** 人员（便于列表展示） */
    private Long personId;

    /** 币种 */
    private String currency;

    /** 应发合计 */
    private BigDecimal grossAmount;

    /** 扣除合计（个人社保 + 个税） */
    private BigDecimal deductionAmount;

    /** 雇主成本合计（应发 + 雇主社保） */
    private BigDecimal employerCostAmount;

    /** 实发 */
    private BigDecimal netAmount;

    /** 应纳税所得额（减个人社保后、减起征点前） */
    private BigDecimal taxableBase;

    /** 个税 */
    private BigDecimal taxAmount;

    /** 规则集快照 */
    private Long ruleSetId;

    /** 状态：CALCULATED / LOCKED（跟随批次） */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}

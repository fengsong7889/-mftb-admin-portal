package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 工资单明细（表 payroll_payslip_item）：工资单上的一行。
 * <p>
 * 行里存名称快照而不是只存 component_id： payroll_component 改名后历史工资单不能跟着变。
 */
@Data
@TableName("payroll_payslip_item")
public class PayrollPayslipItem {

    @TableId
    private Long id;

    /** 所属工资单 */
    private Long payslipId;

    /** 行类型：BASE_SALARY / SOCIAL_EMPLOYEE / SOCIAL_EMPLOYER / TAX */
    private String itemType;

    /** 薪酬项目 ID（可能为空：社保行来自参保方案） */
    private Long componentId;

    /** 参保方案 ID（社保/公积金行） */
    private Long planId;

    /** 名称快照 */
    private String itemName;

    /** 金额 */
    private BigDecimal amount;

    /** 是否应税（结果快照） */
    private Integer taxable;

    /** 展示顺序 */
    private Integer sortOrder;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}

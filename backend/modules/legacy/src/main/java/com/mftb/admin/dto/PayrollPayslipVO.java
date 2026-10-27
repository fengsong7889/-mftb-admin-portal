package com.mftb.admin.dto;

import com.mftb.admin.entity.PayrollPayslip;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** 工资单列表视图：补人员与雇佣编号，只用于展示 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PayrollPayslipVO extends PayrollPayslip {
    private String personName;
    private String personNo;
    private String employmentNo;
}

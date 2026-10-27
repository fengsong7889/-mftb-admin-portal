package com.mftb.admin.dto;

import com.mftb.admin.entity.PayrollPayslipItem;
import lombok.Data;

import java.util.List;

/** 工资单详情：主单 + 明细行 */
@Data
public class PayrollPayslipDetailVO {
    private PayrollPayslipVO payslip;
    private List<PayrollPayslipItem> items;
}

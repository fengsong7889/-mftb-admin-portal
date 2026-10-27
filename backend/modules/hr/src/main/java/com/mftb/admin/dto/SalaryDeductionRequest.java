package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 费用信息-扣除项新增/编辑请求
 */
@Data
public class SalaryDeductionRequest {

    /** 项目名称 */
    @NotBlank(message = "項目名稱不能為空")
    private String name;

    /** 费率（百分比） */
    @NotNull(message = "費率不能為空")
    private BigDecimal rate;

    /** 金额（元） */
    @NotNull(message = "金額不能為空")
    private BigDecimal amount;

    /** 备注 */
    private String remark;
}

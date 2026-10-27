package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 费用信息-收入项新增/编辑请求
 */
@Data
public class SalaryIncomeRequest {

    /** 项目名称 */
    @NotBlank(message = "項目名稱不能為空")
    private String name;

    /** 金额（元） */
    @NotNull(message = "金額不能為空")
    private BigDecimal amount;

    /** 类型（fixed=固定, variable=浮动） */
    @NotBlank(message = "類型不能為空")
    private String type;

    /** 备注 */
    private String remark;
}

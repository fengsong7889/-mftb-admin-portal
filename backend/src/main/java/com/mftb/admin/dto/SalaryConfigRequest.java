package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 费用信息-薪资配置保存请求
 */
@Data
public class SalaryConfigRequest {

    /** 薪资结构 */
    @NotBlank(message = "薪資結構不能為空")
    private String salaryStructure;

    /** 发薪方式 */
    @NotBlank(message = "發薪方式不能為空")
    private String paymentMethod;

    /** 发薪日（1~31） */
    @NotNull(message = "發薪日不能為空")
    @Min(value = 1, message = "發薪日範圍為 1~31")
    @Max(value = 31, message = "發薪日範圍為 1~31")
    private Integer payDay;

    /** 开户银行 */
    private String bankName;

    /** 银行账号 */
    private String bankAccount;

    /** 纳税城市 */
    private String taxCity;
}

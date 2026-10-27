package com.mftb.admin.dto;

import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 欠款单新增扣款（还款）请求
 */
@Data
public class DebtRepaymentDTO {

    /** 还款日期，为空时取当天 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate date;

    /** 还款渠道: 推广金扣款 / 营业额扣款 / 对公转账 */
    private String channel;

    /** 还款金额 */
    private BigDecimal amount;

    private String remark;
}

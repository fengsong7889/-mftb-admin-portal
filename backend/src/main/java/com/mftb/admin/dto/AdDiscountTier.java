package com.mftb.admin.dto;

import java.math.BigDecimal;

/** 人气商家梯度契约：折扣统一为百分比；天数使用精确数值接收以拒绝小数截断。 */
public record AdDiscountTier(BigDecimal minDays, BigDecimal discount) {
}

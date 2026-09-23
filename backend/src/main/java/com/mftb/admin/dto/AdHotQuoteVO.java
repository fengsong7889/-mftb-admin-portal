package com.mftb.admin.dto;

import java.math.BigDecimal;

/** 只读试算结果；下单时仍重新计算，不能以客户端金额作为扣款依据。 */
public record AdHotQuoteVO(
        Long pricingId, String skinName, String displayMode, int days,
        String discountSource, Integer matchedMinDays, BigDecimal discountPercent,
        BigDecimal unitPrice, BigDecimal originalAmount, BigDecimal discountedAmount,
        int giftDays, BigDecimal giftAmount, BigDecimal actualAmount) {
}

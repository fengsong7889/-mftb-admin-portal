package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 充消对账周期总账汇总（对应前端概览卡与合计行）
 */
@Data
public class FinReconcileSummaryVO {

    /** 周期期初余额（首日期初） */
    private BigDecimal initVirtual = BigDecimal.ZERO;
    private BigDecimal initActual = BigDecimal.ZERO;

    /** 周期充值总额 */
    private BigDecimal virtualRecharge = BigDecimal.ZERO;
    private BigDecimal actualRecharge = BigDecimal.ZERO;

    /** 银行收款 / 营业额支付 */
    private BigDecimal bankReceipt = BigDecimal.ZERO;
    private BigDecimal revenuePayment = BigDecimal.ZERO;

    /** 消费总额 */
    private BigDecimal consumeTotal = BigDecimal.ZERO;

    /** 扣款总额 */
    private BigDecimal deductVirtual = BigDecimal.ZERO;
    private BigDecimal deductActual = BigDecimal.ZERO;

    /** 转入 / 转出总额 */
    private BigDecimal virtualTransferIn = BigDecimal.ZERO;
    private BigDecimal actualTransferIn = BigDecimal.ZERO;
    private BigDecimal virtualTransferOut = BigDecimal.ZERO;
    private BigDecimal actualTransferOut = BigDecimal.ZERO;

    /** 交易净额 */
    private BigDecimal virtualNet = BigDecimal.ZERO;
    private BigDecimal actualNet = BigDecimal.ZERO;

    /** 周期期末余额（末日期末） */
    private BigDecimal endVirtual = BigDecimal.ZERO;
    private BigDecimal endActual = BigDecimal.ZERO;
}

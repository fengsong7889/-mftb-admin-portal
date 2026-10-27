package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 充消对账日报行（每个集团每日一行）
 * 勾稽关系: 期末余额 = 期初余额 + 交易净额
 */
@Data
public class FinReconcileRowVO {

    /** 统计日期 */
    private String date;

    /** 集团ID */
    private String groupId;

    private String groupName;
    private String brand;

    /** 期初虚拟/实收账户余额 */
    private BigDecimal initVirtual = BigDecimal.ZERO;
    private BigDecimal initActual = BigDecimal.ZERO;

    /** 虚拟/实收账户充值总额 */
    private BigDecimal virtualRecharge = BigDecimal.ZERO;
    private BigDecimal actualRecharge = BigDecimal.ZERO;

    /** 银行收款 / 营业额支付（实收充值构成） */
    private BigDecimal bankReceipt = BigDecimal.ZERO;
    private BigDecimal revenuePayment = BigDecimal.ZERO;

    /** 消费总额 */
    private BigDecimal consumeTotal = BigDecimal.ZERO;

    /** 扣款总额（虚拟） / 扣款实收变动 */
    private BigDecimal deductVirtual = BigDecimal.ZERO;
    private BigDecimal deductActual = BigDecimal.ZERO;

    /** 虚拟/实收账户转入总额 */
    private BigDecimal virtualTransferIn = BigDecimal.ZERO;
    private BigDecimal actualTransferIn = BigDecimal.ZERO;

    /** 虚拟/实收账户转出总额 */
    private BigDecimal virtualTransferOut = BigDecimal.ZERO;
    private BigDecimal actualTransferOut = BigDecimal.ZERO;

    /** 虚拟/实收账户交易净额 */
    private BigDecimal virtualNet = BigDecimal.ZERO;
    private BigDecimal actualNet = BigDecimal.ZERO;

    /** 期末虚拟/实收账户余额 */
    private BigDecimal endVirtual = BigDecimal.ZERO;
    private BigDecimal endActual = BigDecimal.ZERO;
}

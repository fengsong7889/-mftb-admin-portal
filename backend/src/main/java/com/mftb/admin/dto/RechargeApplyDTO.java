package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金充值申请（字段与前端 RechargeAdd 提交的 extra 一致）
 */
@Data
public class RechargeApplyDTO {

    /** 集团ID */
    private String groupId;
    private String groupName;
    private String brand;

    /** 业务类型 */
    private String businessType;

    /** 业务渠道展示名 */
    private String businessChannelLabel;

    /** 是否实收充值 */
    private Boolean isActual;

    /** 支付方式: corporate=对公转账 mixed=混合支付 revenue=营业额支付 */
    private String payMethod;

    /** 虚拟充值金额 */
    private BigDecimal virtualAmount;

    /** 实收充值总额 */
    private BigDecimal actualTotal;

    /** 优惠金额 */
    private BigDecimal discountAmount;

    /** 银行收款金额 */
    private BigDecimal bankAmount;

    /** 营业额支付金额 */
    private BigDecimal revenueAmount;

    /** 营业额扣款门店明细（生成扣款明细与欠款单） */
    private List<StoreAmountDTO> deductStores;

    private String bd;
    private String remark;
}

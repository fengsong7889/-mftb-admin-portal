package com.mftb.admin.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.Valid;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金充值申请（字段与前端 RechargeAdd 提交的 extra 一致）
 */
@Data
public class RechargeApplyDTO {

    /** 集团ID */
    @NotBlank(message = "集團ID不能為空")
    private String groupId;

    @NotBlank(message = "集團名稱不能為空")
    private String groupName;

    @NotBlank(message = "品牌不能為空")
    private String brand;

    /** 业务类型 */
    private String businessType;

    /** 业务渠道展示名 */
    private String businessChannelLabel;

    /** 是否实收充值 */
    private Boolean isActual;

    /** 支付方式: corporate=对公转账 mixed=混合支付 revenue=营业额支付 */
    @Pattern(regexp = "^(corporate|mixed|revenue)$", message = "支付方式不合法")
    private String payMethod;

    /** 虚拟充值金额 */
    @NotNull(message = "虛擬充值金額不能為空")
    @DecimalMin(value = "0.01", message = "虛擬充值金額必須大於 0")
    @DecimalMax(value = "99999999.99", message = "虛擬充值金額超出上限")
    private BigDecimal virtualAmount;

    /** 实收充值总额 */
    @NotNull(message = "實收充值總額不能為空")
    @DecimalMin(value = "0.00", message = "實收充值總額不能為負數")
    @DecimalMax(value = "99999999.99", message = "實收充值總額超出上限")
    private BigDecimal actualTotal;

    /** 优惠金额 */
    @NotNull(message = "優惠金額不能為空")
    @DecimalMin(value = "0.00", message = "優惠金額不能為負數")
    @DecimalMax(value = "99999999.99", message = "優惠金額超出上限")
    private BigDecimal discountAmount;

    /** 银行收款金额 */
    @NotNull(message = "銀行收款金額不能為空")
    @DecimalMin(value = "0.00", message = "銀行收款金額不能為負數")
    @DecimalMax(value = "99999999.99", message = "銀行收款金額超出上限")
    private BigDecimal bankAmount;

    /** 营业额支付金额 */
    @NotNull(message = "營業額支付金額不能為空")
    @DecimalMin(value = "0.00", message = "營業額支付金額不能為負數")
    @DecimalMax(value = "99999999.99", message = "營業額支付金額超出上限")
    private BigDecimal revenueAmount;

    /** 营业额扣款门店明细（生成扣款明细与欠款单） */
    @Valid
    private List<StoreAmountDTO> deductStores;

    private String bd;
    private String remark;
}

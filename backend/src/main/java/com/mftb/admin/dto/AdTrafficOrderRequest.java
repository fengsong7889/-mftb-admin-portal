package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 投流广告下单请求（从推广金账户扣款，支持赠送天数抵扣）
 * <p>
 * 购买方式二选一：
 * - tier: 传 tierId（预设档位），曝光/价格由服务端从定价配置读取；
 * - custom: 传 impressions（自定义曝光数量），按阶梯单价服务端计价。
 */
@Data
public class AdTrafficOrderRequest {

    /** 投流定价配置ID（biz_ad_pricing_traffic.id，即某算法某业务频道的定价） */
    @NotNull(message = "定价配置不能为空")
    private Long pricingId;

    /** 购买方式: tier=预设档位 custom=自定义数量 */
    @NotBlank(message = "购买方式不能为空")
    private String mode;

    /** 档位ID（mode=tier 时必填） */
    private Long tierId;

    /** 自定义曝光次数（mode=custom 时必填） */
    private Integer impressions;

    /** 投流时段: business=主营时段投流 allday=全天投流 */
    private String deliverySlot;

    /** 购买集团ID（关联推广金账户） */
    @NotBlank(message = "集团不能为空")
    private String groupCode;

    /** 购买门店编码 */
    private String storeCode;

    /** 归属BD */
    private String bdEmpId;

    /** 赠送天数抵扣（来自赠送管理发放的余额，按每日折算价值抵扣订单金额） */
    private Integer giftDays;

    /** 备注 */
    private String remark;
}

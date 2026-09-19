package com.mftb.admin.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 金字招牌计价配置新增/编辑请求
 */
@Data
public class AdPricingSignboardRequest {

    /** 关联算法ID */
    @NotNull(message = "請選擇算法")
    private Long algoId;

    /** 算法名称（前端传入快照） */
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（默认 7） */
    @NotNull(message = "預售天數不能為空")
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 取消扣费梯度: [{"remainDays":3,"ratio":80}] */
    private List<Map<String, Object>> cancelFeeTiers;

    /** 折扣模式: global=全局折扣 local=局部折扣 */
    private String discountMode;

    /** 全局折扣梯度: [{"minDays":3,"discount":95}] */
    private List<Map<String, Object>> globalDiscountTiers;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 标签计价配置（至少一个启用标签） */
    @NotEmpty(message = "請至少配置一個標籤")
    private List<LabelPrice> signboardItems;

    /** 标签计价条目 */
    @Data
    public static class LabelPrice {
        /** 标签类型 */
        private String labelType;
        /** 场景（all_macau/district，统计类不传） */
        private String scenario;
        /** 是否启用 */
        private Boolean enabled;
        /** 标签日单价（MOP/天） */
        private BigDecimal price;
        /** 梯度折扣: [{"minDays":3,"discount":95}] */
        private List<Map<String, Object>> discountTiers;
    }
}

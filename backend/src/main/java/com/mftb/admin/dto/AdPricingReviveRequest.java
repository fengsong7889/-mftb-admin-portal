package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 盘活复苏计价配置新增/编辑请求
 */
@Data
public class AdPricingReviveRequest {

    /** 关联算法ID */
    @NotNull(message = "关联算法不能为空")
    private Long algoId;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（今天起 N 天可售），缺省 180 */
    @NotNull(message = "预售天数不能为空")
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 多天梯度折扣: [{"minDays":3,"discount":95},{"minDays":7,"discount":90}] */
    private List<Map<String, Object>> discountTiers;

    /** 取消扣费梯度: [{"remainDays":0,"ratio":100},{"remainDays":3,"ratio":80}] */
    private List<Map<String, Object>> cancelFeeTiers;

    /** 屏蔽商家开关: 1=启用 2=关闭 */
    private Integer blockMerchant;

    /** 屏蔽商家列表 */
    private List<Map<String, Object>> blockList;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 分商圈计价配置（整体替换） */
    private List<RegionPrice> regionPrices;

    /** 商圈计价条目 */
    @Data
    public static class RegionPrice {
        /** 商圈: 1=黑沙环区 ... 11=黑沙滩区 */
        private Integer region;
        /** 该商圈日单价（MOP） */
        private BigDecimal dailyPrice;
        /** 每天销售个数（库存），缺省 1 */
        private Integer dailySalesLimit;
    }
}

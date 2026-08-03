package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 无敌星星计价配置新增/编辑请求
 */
@Data
public class AdPricingStarRequest {

    /** 关联算法ID */
    @NotNull(message = "关联算法不能为空")
    private Long algoId;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（今天起 N 天可售） */
    @NotNull(message = "预售天数不能为空")
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 多时段梯度折扣: [{"minSlots":3,"discount":95},{"minSlots":5,"discount":90}] */
    private List<Map<String, Object>> discountTiers;

    /** 取消扣费梯度: [{"remainDays":0,"ratio":100},{"remainDays":3,"ratio":80}] */
    private List<Map<String, Object>> cancelFeeTiers;

    /** 屏蔽商家开关: 1=启用 2=关闭 */
    private Integer blockMerchant;

    /** 屏蔽商家列表 */
    private List<Map<String, Object>> blockList;

    /** 可售时段: ["breakfast","lunch"] 等; 空或含 fullDay 表示全部时段 */
    private List<String> sellTimeSlots;

    /** 分商圈时段折扣配置（整体替换） */
    private List<RegionSlotDiscount> slotDiscounts;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 分商圈日单价配置（整体替换） */
    private List<RegionPrice> regionPrices;

    /** 商圈日单价 */
    @Data
    public static class RegionPrice {
        /** 商圈: 1=黑沙环区 ... 11=黑沙滩区 */
        private Integer region;
        /** 该商圈日单价（MOP） */
        private BigDecimal dailyPrice;
    }

    /** 商圈时段折扣（百分比记法: 80 = 8折） */
    @Data
    public static class RegionSlotDiscount {
        /** 商圈 */
        private Integer region;
        /** 全时段折扣（购买当天全部 5 个时段时适用） */
        private Integer fullDay;
        /** 早餐折扣 */
        private Integer breakfast;
        /** 午餐折扣 */
        private Integer lunch;
        /** 下午茶折扣 */
        private Integer afternoon;
        /** 晚餐折扣 */
        private Integer dinner;
        /** 宵夜折扣 */
        private Integer supper;
        /** 限时打折开关（仅持久化展示用） */
        private Boolean limitedTime;
        /** 折扣周期开始日期 */
        private String startDate;
        /** 折扣周期结束日期 */
        private String endDate;
    }
}

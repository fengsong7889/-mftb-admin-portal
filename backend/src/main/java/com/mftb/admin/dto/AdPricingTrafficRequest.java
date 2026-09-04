package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 投流广告计价配置新增/编辑请求（一个算法每个业务频道一条配置）
 */
@Data
public class AdPricingTrafficRequest {

    /** 关联算法ID（biz_ad_algorithm.id，algo_type=15） */
    @NotNull(message = "算法不能为空")
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道: 1=美食外卖 2=超市百货 3=团购到店 */
    @NotNull(message = "业务频道不能为空")
    private Integer bizChannel;

    /** 自定义购买最低起购量（曝光次数），缺省 100 */
    private Integer customMinQty;

    /** 自定义购买步长（曝光次数），缺省 100 */
    private Integer customStep;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 退款手续费比例（%）：手续费 = 退款金额 × 比例，0=免费退 */
    private Integer refundFeePercent;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 预设档位配置（整体替换，流量包套餐） */
    private List<TierItem> tiers;

    /** 阶梯单价配置（整体替换，自定义曝光数量计价） */
    private List<LadderItem> ladder;

    /** 预设档位条目 */
    @Data
    public static class TierItem {
        /** 档位名称 */
        private String tierName;
        /** 曝光次数 */
        private Integer impressions;
        /** 套餐价格（MOP） */
        private BigDecimal price;
        /** 有效期（天，已停用：流量包消耗完毕即退出） */
        private Integer validityDays;
        /** 是否上架: 1=上架 2=下架 */
        private Integer onSale;
        /** 排序（从1开始） */
        private Integer sort;
        /** 折扣开关: 1=开启 0=关闭 */
        private Integer discountEnabled;
        /** 折扣（折，如 8.5 = 85折） */
        private BigDecimal discount;
        /** 折扣时间模式: unlimited=不限时间 limited=限定时间 */
        private String discountTimeMode;
        /** 折扣活动开始日期（限定时间模式） */
        private LocalDate discountStartDate;
        /** 折扣活动结束日期（限定时间模式） */
        private LocalDate discountEndDate;
    }

    /** 阶梯单价条目（区间为 [minQty, maxQty] 闭区间，maxQty=0 表示无上限） */
    @Data
    public static class LadderItem {
        /** 区间下限（含，曝光次数） */
        private Integer minQty;
        /** 区间上限（含），0=无上限 */
        private Integer maxQty;
        /** 单次曝光单价（MOP） */
        private BigDecimal unitPrice;
    }
}

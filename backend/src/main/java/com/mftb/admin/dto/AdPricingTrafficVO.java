package com.mftb.admin.dto;

import com.mftb.admin.entity.AdPricingTraffic;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 投流广告计价配置展示 VO（含预设档位 + 阶梯单价明细）
 */
@Data
public class AdPricingTrafficVO {

    private Long id;
    /** 定价编号（按编号生成规则 config_pricing_traffic 生成，如 DJTL20260812000） */
    private String pricingNo;
    private Long algoId;
    private String algoName;
    private String brand;
    /** 业务频道: 1=美食外卖 2=超市百货 3=团购到店 */
    private Integer bizChannel;
    /** 自定义购买最低起购量（曝光次数） */
    private Integer customMinQty;
    /** 自定义购买步长（曝光次数） */
    private Integer customStep;
    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;
    /** 退款手续费比例（%） */
    private Integer refundFeePercent;
    /** 服务状态: 1=启用 2=停用 */
    private Integer status;
    private String remark;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 预设档位（流量包套餐） */
    private List<TierItem> tiers = new ArrayList<>();

    /** 阶梯单价（自定义曝光数量计价） */
    private List<LadderItem> ladder = new ArrayList<>();

    public static AdPricingTrafficVO from(AdPricingTraffic entity) {
        AdPricingTrafficVO vo = new AdPricingTrafficVO();
        vo.setId(entity.getId());
        vo.setPricingNo(entity.getPricingNo());
        vo.setAlgoId(entity.getAlgoId());
        vo.setAlgoName(entity.getAlgoName());
        vo.setBrand(entity.getBrand());
        vo.setBizChannel(entity.getBizChannel());
        vo.setCustomMinQty(entity.getCustomMinQty());
        vo.setCustomStep(entity.getCustomStep());
        vo.setRefundEnabled(entity.getRefundEnabled());
        vo.setRefundFeePercent(entity.getRefundFeePercent());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    /** 预设档位条目 */
    @Data
    public static class TierItem {
        private Long id;
        private String tierName;
        private Integer impressions;
        private BigDecimal price;
        private Integer validityDays;
        /** 是否上架: 1=上架 2=下架 */
        private Integer onSale;
        private Integer sort;
        /** 折扣开关: 1=开启 0=关闭 */
        private Integer discountEnabled;
        /** 折扣（折，如 8.5 = 85折） */
        private BigDecimal discount;
        /** 折扣时间模式: unlimited=不限时间 limited=限定时间 */
        private String discountTimeMode;
        private LocalDate discountStartDate;
        private LocalDate discountEndDate;
    }

    /** 阶梯单价条目 */
    @Data
    public static class LadderItem {
        private Long id;
        /** 区间下限（含，曝光次数） */
        private Integer minQty;
        /** 区间上限（含），0=无上限 */
        private Integer maxQty;
        /** 单次曝光单价（MOP） */
        private BigDecimal unitPrice;
    }
}

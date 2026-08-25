package com.mftb.admin.dto;

import com.mftb.admin.entity.AdPricingSignboard;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 金字招牌计价配置展示 VO
 */
@Data
public class AdPricingSignboardVO {

    private Long id;
    /** 定价编号 */
    private String pricingNo;
    private Long algoId;
    private String algoName;
    private String brand;
    private Integer channel;
    private Integer presaleDays;
    private Integer refundEnabled;
    /** 取消扣费梯度 JSON 字符串 */
    private String cancelFeeTiers;
    /** 折扣模式: global/local */
    private String discountMode;
    /** 全局折扣梯度 JSON 字符串 */
    private String globalDiscountTiers;
    private Integer status;
    private String remark;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 标签计价明细 */
    private List<LabelPriceItem> signboardItems = new ArrayList<>();

    public static AdPricingSignboardVO from(AdPricingSignboard entity) {
        AdPricingSignboardVO vo = new AdPricingSignboardVO();
        vo.setId(entity.getId());
        vo.setPricingNo(entity.getPricingNo());
        vo.setAlgoId(entity.getAlgoId());
        vo.setAlgoName(entity.getAlgoName());
        vo.setBrand(entity.getBrand());
        vo.setChannel(entity.getChannel());
        vo.setPresaleDays(entity.getPresaleDays());
        vo.setRefundEnabled(entity.getRefundEnabled());
        vo.setCancelFeeTiers(entity.getCancelFeeTiers());
        vo.setDiscountMode(entity.getDiscountMode());
        vo.setGlobalDiscountTiers(entity.getGlobalDiscountTiers());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    /** 标签计价条目 */
    @Data
    public static class LabelPriceItem {
        private Long id;
        /** 标签类型 */
        private String labelType;
        /** 场景（all_macau/district/null） */
        private String scenario;
        /** 是否启用 */
        private Boolean enabled;
        /** 标签日单价（MOP/天） */
        private BigDecimal price;
        /** 梯度折扣 JSON */
        private String discountTiers;
    }
}

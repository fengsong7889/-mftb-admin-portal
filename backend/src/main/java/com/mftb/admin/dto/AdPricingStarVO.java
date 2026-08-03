package com.mftb.admin.dto;

import com.mftb.admin.entity.AdPricingStar;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 无敌星星计价配置展示 VO
 */
@Data
public class AdPricingStarVO {

    private Long id;
    private Long algoId;
    private String algoName;
    private String brand;
    private Integer channel;
    private Integer presaleDays;
    private Integer refundEnabled;
    /** 多时段梯度折扣 JSON 字符串 */
    private String discountTiers;
    /** 取消扣费梯度 JSON 字符串 */
    private String cancelFeeTiers;
    private Integer blockMerchant;
    /** 屏蔽商家列表 JSON 字符串 */
    private String blockList;
    private Integer status;
    private String remark;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 分商圈日单价 */
    private List<RegionPriceItem> regionPrices = new ArrayList<>();

    public static AdPricingStarVO from(AdPricingStar entity) {
        AdPricingStarVO vo = new AdPricingStarVO();
        vo.setId(entity.getId());
        vo.setAlgoId(entity.getAlgoId());
        vo.setAlgoName(entity.getAlgoName());
        vo.setBrand(entity.getBrand());
        vo.setChannel(entity.getChannel());
        vo.setPresaleDays(entity.getPresaleDays());
        vo.setRefundEnabled(entity.getRefundEnabled());
        vo.setDiscountTiers(entity.getDiscountTiers());
        vo.setCancelFeeTiers(entity.getCancelFeeTiers());
        vo.setBlockMerchant(entity.getBlockMerchant());
        vo.setBlockList(entity.getBlockList());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    /** 商圈日单价条目 */
    @Data
    public static class RegionPriceItem {
        private Long id;
        private Integer region;
        private BigDecimal dailyPrice;
    }
}

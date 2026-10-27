package com.mftb.admin.dto;

import com.mftb.admin.entity.AdPricingRevive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 盘活复苏计价配置展示 VO
 */
@Data
public class AdPricingReviveVO {

    private Long id;
    /** 定价编号（按编号生成规则 config_pricing_revive 生成，如 DJPH20260812000） */
    private String pricingNo;
    private Long algoId;
    private String algoName;
    private String brand;
    private Integer channel;
    private Integer presaleDays;
    private Integer refundEnabled;
    /** 多天梯度折扣 JSON 字符串 */
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

    /** 分商圈计价 */
    private List<RegionPriceItem> regionPrices = new ArrayList<>();

    public static AdPricingReviveVO from(AdPricingRevive entity) {
        AdPricingReviveVO vo = new AdPricingReviveVO();
        vo.setId(entity.getId());
        vo.setPricingNo(entity.getPricingNo());
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

    /** 商圈计价条目 */
    @Data
    public static class RegionPriceItem {
        private Long id;
        private Integer region;
        private BigDecimal dailyPrice;
        /** 每天销售个数（库存） */
        private Integer dailySalesLimit;
    }
}

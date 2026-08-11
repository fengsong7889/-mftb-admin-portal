package com.mftb.admin.dto;

import com.mftb.admin.entity.AdPricingHot;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 人气商家计价配置展示 VO
 */
@Data
public class AdPricingHotVO {

    private Long id;
    private Long algoId;
    private String algoName;
    private String brand;
    private Integer channel;
    private Integer presaleDays;
    private Integer refundEnabled;
    /** 多格梯度折扣 JSON 字符串 */
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

    /** 皮肤计价（定价界面自定义皮肤） */
    private List<SkinPriceItem> skins = new ArrayList<>();

    public static AdPricingHotVO from(AdPricingHot entity) {
        AdPricingHotVO vo = new AdPricingHotVO();
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

    /** 皮肤计价条目 */
    @Data
    public static class SkinPriceItem {
        private Long id;
        private String skinName;
        private BigDecimal price;
        /** 边框方式: none=无边框 color=选择配色 image=上传边框图 */
        private String borderType;
        /** 边框颜色(HEX, borderType=color时生效) */
        private String borderColor;
    }
}

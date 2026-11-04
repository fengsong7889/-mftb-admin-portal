/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import com.mftb.admin.entity.AdPricingTimeSlot;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 時段推薦廣告計價配置展示 VO
 * <p>
 * 商家範圍/分類/折扣梯度/退款梯度等以 JSON 字符串回傳，前端按既有 parseJsonList 口徑解析。
 */
@Data
public class AdPricingTimeSlotVO {

    private Long id;
    private String pricingNo;
    private Long algoId;
    private String algoName;
    private String brand;
    private Integer channel;
    private Integer presaleDays;

    /** 商家可購範圍: all/whitelist/blacklist/category */
    private String merchantScope;
    /** 可購分類編碼 JSON 字符串 */
    private String allowCategories;
    /** 可購商家白名單 JSON 字符串 */
    private String whitelistMerchants;
    /** 不可購商家黑名單 JSON 字符串 */
    private String blacklistMerchants;
    /** 分類內排除商家 JSON 字符串 */
    private String categoryExcludeMerchants;

    /** 按購買天數折扣開關: 1/0 */
    private Integer daysDiscountEnabled;
    /** 按購買天數折扣梯度 JSON 字符串 */
    private String daysDiscountTiers;

    private Integer refundEnabled;
    /** 取消扣費梯度 JSON 字符串 */
    private String cancelFeeTiers;

    private Integer status;
    private String remark;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 時段明細 */
    private List<SlotItem> slots = new ArrayList<>();

    public static AdPricingTimeSlotVO from(AdPricingTimeSlot entity) {
        AdPricingTimeSlotVO vo = new AdPricingTimeSlotVO();
        vo.setId(entity.getId());
        vo.setPricingNo(entity.getPricingNo());
        vo.setAlgoId(entity.getAlgoId());
        vo.setAlgoName(entity.getAlgoName());
        vo.setBrand(entity.getBrand());
        vo.setChannel(entity.getChannel());
        vo.setPresaleDays(entity.getPresaleDays());
        vo.setMerchantScope(entity.getMerchantScope());
        vo.setAllowCategories(entity.getAllowCategories());
        vo.setWhitelistMerchants(entity.getWhitelistMerchants());
        vo.setBlacklistMerchants(entity.getBlacklistMerchants());
        vo.setCategoryExcludeMerchants(entity.getCategoryExcludeMerchants());
        vo.setDaysDiscountEnabled(entity.getDaysDiscountEnabled());
        vo.setDaysDiscountTiers(entity.getDaysDiscountTiers());
        vo.setRefundEnabled(entity.getRefundEnabled());
        vo.setCancelFeeTiers(entity.getCancelFeeTiers());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    /** 時段明細條目 */
    @Data
    public static class SlotItem {
        private Long id;
        private String slotKey;
        private String slotName;
        private String startTime;
        private String endTime;
        private BigDecimal price;
        /** 是否配置折扣 */
        private Boolean discountEnabled;
        private BigDecimal discount;
        /** 折扣時間模式: limited/unlimited */
        private String discountTimeMode;
        /** 限時折扣開始日期 YYYY-MM-DD */
        private String discountStartDate;
        /** 限時折扣結束日期 YYYY-MM-DD */
        private String discountEndDate;
    }
}

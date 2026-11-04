/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 時段推薦廣告計價配置新增/編輯請求
 */
@Data
public class AdPricingTimeSlotRequest {

    /** 關聯算法ID（時段推薦無算法，可空） */
    private Long algoId;

    /** 時段推薦名稱（運營自命名） */
    @NotBlank(message = "時段推薦名稱不能為空")
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 業務頻道 */
    @NotNull(message = "業務頻道不能為空")
    private Integer channel;

    /** 預售天數（默認 7） */
    @NotNull(message = "預售天數不能為空")
    private Integer presaleDays;

    /** 商家可購範圍: all/whitelist/blacklist/category */
    private String merchantScope;

    /** 可購分類編碼數組（category 模式） */
    private List<String> allowCategories;

    /** 可購商家白名單（whitelist 模式），每項含 storeCode/groupCode/groupName/storeName */
    private List<Map<String, Object>> whitelistMerchants;

    /** 不可購商家黑名單（blacklist 模式） */
    private List<Map<String, Object>> blacklistMerchants;

    /** 分類內排除商家（category 模式） */
    private List<Map<String, Object>> categoryExcludeMerchants;

    /** 按購買天數折扣開關 */
    private Boolean daysDiscountEnabled;

    /** 按購買天數折扣梯度: [{"minDays":n,"discount":折}] */
    private List<Map<String, Object>> daysDiscountTiers;

    /** 退款開關: 1=允許退款 2=不允許 */
    private Integer refundEnabled;

    /** 取消扣費梯度: [{"remainDays":n,"ratio":pct}] */
    private List<Map<String, Object>> cancelFeeTiers;

    /** 服務狀態: 1=啟用 2=停用 */
    private Integer status;

    /** 備註 */
    private String remark;

    /** 時段明細（至少一個） */
    @NotEmpty(message = "請至少配置一個售卖時段")
    private List<SlotItem> slots;

    /** 時段明細條目 */
    @Data
    public static class SlotItem {
        /** 時段標識 */
        private String slotKey;
        /** 時段名稱 */
        @NotBlank(message = "時段名稱不能為空")
        private String slotName;
        /** 售卖開始時間 HH:mm */
        private String startTime;
        /** 售卖結束時間 HH:mm */
        private String endTime;
        /** 售卖價格（MOP） */
        @NotNull(message = "時段售卖價格不能為空")
        private BigDecimal price;
        /** 是否配置折扣 */
        private Boolean discountEnabled;
        /** 折扣（折，如 9.5） */
        private BigDecimal discount;
        /** 折扣時間模式: limited=限時折扣 unlimited=長期打折 */
        private String discountTimeMode;
        /** 限時折扣開始日期 YYYY-MM-DD */
        private String discountStartDate;
        /** 限時折扣結束日期 YYYY-MM-DD */
        private String discountEndDate;
    }
}

/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 時段推薦廣告下單請求（從推廣金賬戶扣款）
 * <p>
 * 購買模型（購物車）：選定定價配置 + 多條目 {時段, 日期集合}，後端展開為「時段 x 日期」格子逐格計價；
 * 同一時段可分多次加購不同日期，按購買天數折扣檔位以「去重天數合計」匹配。
 */
@Data
public class AdTimeSlotOrderRequest {

    /** 定價配置ID（biz_ad_pricing_timeslot.id） */
    @NotNull(message = "定價配置不能為空")
    private Long pricingId;

    /** 購買集團ID（關聯推廣金賬戶） */
    @NotBlank(message = "購買集團不能為空")
    private String groupCode;

    /** 購買門店ID */
    private String storeCode;

    /** 歸屬BD */
    private String bdEmpId;

    /** 業務頻道（下單快照，可空則取定價配置頻道） */
    private Integer channel;

    /** 備註 */
    private String remark;

    /** 贈送天數抵扣（來自贈送管理發放的余額） */
    private Integer giftDays;

    /** 選購條目：每條 = 一個時段 + 其購買日期集合（同一 slotKey 可多條） */
    @NotEmpty(message = "請至少選擇一個時段")
    @Valid
    private List<OrderItem> items;

    /** 單個購物車條目 */
    @Data
    public static class OrderItem {

        /** 時段標識（定價配置 slots.slotKey） */
        @NotBlank(message = "時段標識不能為空")
        private String slotKey;

        /** 購買日期集合（YYYY-MM-DD，需在預售窗口內） */
        @NotEmpty(message = "購買日期不能為空")
        private List<LocalDate> dates;
    }
}

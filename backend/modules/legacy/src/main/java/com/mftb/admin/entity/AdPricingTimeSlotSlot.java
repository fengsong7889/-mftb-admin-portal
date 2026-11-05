/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 時段推薦計價時段明細實體（每個售卖時段一行）
 */
@Data
@TableName("biz_ad_pricing_timeslot_slot")
public class AdPricingTimeSlotSlot {

    @TableId
    private Long id;

    /** 計價主表ID（biz_ad_pricing_timeslot.id） */
    private Long pricingId;

    /** 時段標識（breakfast/lunch/afternoon/dinner/night/custom-N） */
    private String slotKey;

    /** 時段名稱（預設固定名，自定義可改） */
    private String slotName;

    /** 售卖開始時間 HH:mm */
    private String startTime;

    /** 售卖結束時間 HH:mm */
    private String endTime;

    /** 售卖價格（MOP） */
    private BigDecimal price;

    /** 時段折扣開關: 1=啟用 0=停用 */
    private Integer discountEnabled;

    /** 折扣（折，如 9.5） */
    private BigDecimal discount;

    /** 折扣時間模式: limited=限時折扣 unlimited=長期打折 */
    private String discountTimeMode;

    /** 限時折扣開始日期 YYYY-MM-DD */
    private String discountStartDate;

    /** 限時折扣結束日期 YYYY-MM-DD */
    private String discountEndDate;

    /** 排序（按添加順序） */
    private Integer sortOrder;

    /** 邏輯刪除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

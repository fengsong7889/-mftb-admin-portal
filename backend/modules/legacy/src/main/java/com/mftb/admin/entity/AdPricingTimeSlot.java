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

import java.time.LocalDateTime;

/**
 * 時段推薦廣告計價主實體（對應「銷售定價」菜單 → 外賣到家 → 時段推薦廣告）
 * <p>
 * 與其它廣告計價不同：本類型無算法（algoId 可空），名稱由運營自命名（存於 algoName）；
 * 商家可購範圍、時段明細、按天數折扣、退款配置等結構化字段以 JSON 存於主表，時段明細獨立子表。
 */
@Data
@TableName("biz_ad_pricing_timeslot")
public class AdPricingTimeSlot {

    @TableId
    private Long id;

    /** 定價編號（DJSD + YYYYMMDD + 3位） */
    private String pricingNo;

    /** 關聯算法ID（時段推薦無算法，可空） */
    private Long algoId;

    /** 時段推薦名稱（運營自命名，列表/訂單展示用） */
    private String algoName;

    /** 所属品牌 */
    private String brand;

    /** 業務頻道 */
    private Integer channel;

    /** 預售天數（默認 7 天） */
    private Integer presaleDays;

    /** 商家可購範圍: all/whitelist/blacklist/category */
    private String merchantScope;

    /** 可購分類編碼數組 JSON（merchant_scope=category 時生效） */
    private String allowCategories;

    /** 可購商家白名單 JSON（merchant_scope=whitelist 時生效） */
    private String whitelistMerchants;

    /** 不可購商家黑名單 JSON（merchant_scope=blacklist 時生效） */
    private String blacklistMerchants;

    /** 分類內排除商家 JSON（merchant_scope=category 時生效） */
    private String categoryExcludeMerchants;

    /** 按購買天數折扣開關: 1=啟用 0=停用 */
    private Integer daysDiscountEnabled;

    /** 按購買天數折扣梯度 JSON [{"minDays":n,"discount":折}] */
    private String daysDiscountTiers;

    /** 退款開關: 1=允許退款 2=不允許 */
    private Integer refundEnabled;

    /** 取消扣費梯度（JSON 字符串） */
    private String cancelFeeTiers;

    /** 服務狀態: 1=啟用 2=停用 */
    private Integer status;

    /** 備註 */
    private String remark;

    /** 最後更新人 */
    private String updatedBy;

    /** 邏輯刪除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

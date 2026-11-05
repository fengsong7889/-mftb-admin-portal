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
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 時段推薦廣告訂單明細實體（一行 = 一個「時段 x 日期」格子）
 */
@Data
@TableName("biz_ad_order_item_timeslot")
public class AdOrderItemTimeSlot {

    @TableId
    private Long id;

    /** 訂單主表ID（biz_ad_order.id） */
    private Long orderId;

    /** 訂單編號快照 */
    private String orderNo;

    /** 投放日期 */
    private LocalDate bizDate;

    /** 時段標識（breakfast/lunch/.../custom-N） */
    private String slotKey;

    /** 時段名稱快照（早餐/午餐/...） */
    private String slotName;

    /** 格子原價（時段日單價） */
    private BigDecimal originalPrice;

    /** 實付分攤價（折扣後） */
    private BigDecimal salePrice;

    /** 已退款金額（取消扣費梯度） */
    private BigDecimal refundPrice;

    /** 投放狀態: 1=待投放 2=已投放 3=已退款 */
    private Integer deliveryStatus;

    /** 邏輯刪除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}

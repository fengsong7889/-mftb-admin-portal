/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdTimeSlotOrderRequest;

import java.util.List;

/**
 * 時段推薦廣告銷售服務（下單扣款）
 */
public interface AdSalesTimeSlotService {

    /** 提交訂單並從推廣金賬戶扣款 */
    AdOrderVO placeOrder(AdTimeSlotOrderRequest request);

    /**
     * 預售窗口內已購買（活躍訂單）的格子集合，元素格式「YYYY-MM-DD|slotKey」。
     * <p>供選購頁在「添加到購物車」時前置攔截，避免走到最終支付才報重複。
     */
    List<String> purchasedCells(Long pricingId, String groupCode);
}

/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.dto.AdPricingTimeSlotRequest;
import com.mftb.admin.dto.AdPricingTimeSlotVO;
import com.mftb.admin.dto.PageResult;

/**
 * 時段推薦廣告計價服務
 */
public interface AdPricingTimeSlotService {

    /** 計價配置分頁查詢 */
    PageResult<AdPricingTimeSlotVO> page(long page, long size, String brand, Integer channel, Integer status);

    /** 計價配置詳情（不存在拋異常） */
    AdPricingTimeSlotVO detail(Long id);

    /**
     * 按定價配置主鍵查詳情，不存在返回 null（不抛異常）。
     * <p>時段推薦訂單的 algo_id 存的是定價配置ID，退款回查取消扣費梯度必須走本方法。
     */
    AdPricingTimeSlotVO detailOrNull(Long id);

    /** 新增計價配置 */
    AdPricingTimeSlotVO create(AdPricingTimeSlotRequest request);

    /** 編輯計價配置 */
    AdPricingTimeSlotVO update(Long id, AdPricingTimeSlotRequest request);

    /** 啟用/停用 */
    void updateStatus(Long id, Integer status);

    /** 刪除計價配置（含時段明細） */
    void delete(Long id);
}

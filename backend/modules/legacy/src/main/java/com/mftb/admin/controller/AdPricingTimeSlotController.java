/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdPricingTimeSlotRequest;
import com.mftb.admin.dto.AdPricingTimeSlotVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.StatusUpdateDTO;
import com.mftb.admin.service.AdPricingTimeSlotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 時段推薦廣告銷售定價接口
 */
@RestController
@RequestMapping("/api/ad/pricing/timeslot")
@RequiredArgsConstructor
public class AdPricingTimeSlotController {

    private final AdPricingTimeSlotService pricingService;

    /** 計價配置分頁查詢 */
    @GetMapping
    @RequirePermission(menu = "ad-sales")
    public Result<PageResult<AdPricingTimeSlotVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Integer channel,
            @RequestParam(required = false) Integer status) {
        return Result.success(pricingService.page(page, size, brand, channel, status));
    }

    /** 計價配置詳情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = "ad-sales")
    public Result<AdPricingTimeSlotVO> detail(@PathVariable Long id) {
        return Result.success(pricingService.detail(id));
    }

    /** 新增計價配置 */
    @PostMapping
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<AdPricingTimeSlotVO> create(@Valid @RequestBody AdPricingTimeSlotRequest request) {
        return Result.success("計價配置已保存", pricingService.create(request));
    }

    /** 編輯計價配置 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<AdPricingTimeSlotVO> update(@PathVariable Long id, @Valid @RequestBody AdPricingTimeSlotRequest request) {
        return Result.success("計價配置已更新", pricingService.update(id, request));
    }

    /** 啟用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestBody StatusUpdateDTO dto) {
        pricingService.updateStatus(id, dto.getStatus());
        return Result.success();
    }

    /** 刪除計價配置 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<Void> delete(@PathVariable Long id) {
        pricingService.delete(id);
        return Result.success();
    }
}

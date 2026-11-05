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
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdTimeSlotOrderRequest;
import com.mftb.admin.service.AdSalesTimeSlotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 時段推薦廣告銷售接口（下單扣款）
 */
@RestController
@RequestMapping("/api/ad/sales/timeslot")
@RequiredArgsConstructor
public class AdSalesTimeSlotController {

    private final AdSalesTimeSlotService salesService;

    /** 提交訂單並從推廣金賬戶扣款 */
    @PostMapping("/order")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdTimeSlotOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

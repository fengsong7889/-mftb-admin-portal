package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdHotInventoryVO;
import com.mftb.admin.dto.AdHotOrderRequest;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.service.AdSalesHotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 人气商家广告销售接口（库存查询 + 下单）
 */
@RestController
@RequestMapping("/api/ad/sales/hot")
@RequiredArgsConstructor
public class AdSalesHotController {

    private final AdSalesHotService salesService;

    /** 查询可购买格子（皮肤 x 日期, 不限库存；storeCode/groupCode 用于屏蔽商家拦截与已购标记） */
    @GetMapping("/inventory")
    @RequirePermission(menu = "ad-sales")
    public Result<AdHotInventoryVO> inventory(@RequestParam Long algoId,
                                              @RequestParam(required = false) String storeCode,
                                              @RequestParam(required = false) String groupCode) {
        return Result.success(salesService.inventory(algoId, storeCode, groupCode));
    }

    /** 提交订单并从推广金账户扣款（同商家已购买的皮肤x日期不可重复购买） */
    @PostMapping("/order")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdHotOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

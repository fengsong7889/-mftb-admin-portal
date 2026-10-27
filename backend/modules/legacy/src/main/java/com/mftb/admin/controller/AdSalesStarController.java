package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdInventoryVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdStarOrderRequest;
import com.mftb.admin.service.AdSalesStarService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 无敌星星广告销售接口（库存查询 + 下单）
 */
@RestController
@RequestMapping("/api/ad/sales/star")
@RequiredArgsConstructor
public class AdSalesStarController {

    private final AdSalesStarService salesService;

    /** 查询可购买格子（商圈 x 日期 x 餐段；storeCode/groupCode 用于屏蔽商家拦截） */
    @GetMapping("/inventory")
    @RequirePermission(menu = "ad-sales")
    public Result<AdInventoryVO> inventory(@RequestParam Long algoId,
                                           @RequestParam(required = false) String storeCode,
                                           @RequestParam(required = false) String groupCode) {
        return Result.success(salesService.inventory(algoId, storeCode, groupCode));
    }

    /** 加购锁定格子 60 秒（其它商家看到已售罄，到期自动释放） */
    @PostMapping("/lock")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<Void> lockCells(@Valid @RequestBody AdStarOrderRequest request) {
        salesService.lockCells(request);
        return Result.success();
    }

    /** 释放加购锁（移除购物车/取消时调用） */
    @PostMapping("/unlock")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<Void> unlockCells(@Valid @RequestBody AdStarOrderRequest request) {
        salesService.unlockCells(request);
        return Result.success();
    }

    /** 提交订单并从推广金账户扣款 */
    @PostMapping("/order")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdStarOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

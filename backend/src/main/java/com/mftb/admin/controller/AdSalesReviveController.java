package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdReviveInventoryVO;
import com.mftb.admin.dto.AdReviveOrderRequest;
import com.mftb.admin.service.AdSalesReviveService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 盘活复苏广告销售接口（库存查询 + 加购锁 + 下单）
 */
@RestController
@RequestMapping("/api/ad/sales/revive")
@RequiredArgsConstructor
public class AdSalesReviveController {

    private final AdSalesReviveService salesService;

    /** 查询可购买格子（商圈 x 日期；storeCode/groupCode 用于屏蔽商家拦截） */
    @GetMapping("/inventory")
    public Result<AdReviveInventoryVO> inventory(@RequestParam Long algoId,
                                                 @RequestParam(required = false) String storeCode,
                                                 @RequestParam(required = false) String groupCode) {
        return Result.success(salesService.inventory(algoId, storeCode, groupCode));
    }

    /** 加购锁定格子 60 秒（占用库存额度，到期自动释放） */
    @PostMapping("/lock")
    public Result<Void> lockCells(@Valid @RequestBody AdReviveOrderRequest request) {
        salesService.lockCells(request);
        return Result.success();
    }

    /** 释放加购锁（移除购物车/取消时调用） */
    @PostMapping("/unlock")
    public Result<Void> unlockCells(@Valid @RequestBody AdReviveOrderRequest request) {
        salesService.unlockCells(request);
        return Result.success();
    }

    /** 提交订单并从推广金账户扣款（支持赠送天数抵扣） */
    @PostMapping("/order")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdReviveOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

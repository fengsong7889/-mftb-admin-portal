package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdSignboardInventoryVO;
import com.mftb.admin.dto.AdSignboardOrderRequest;
import com.mftb.admin.service.AdSalesSignboardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 金字招牌广告销售接口（库存查询 + 下单）
 */
@RestController
@RequestMapping("/api/ad/sales/signboard")
@RequiredArgsConstructor
public class AdSalesSignboardController {

    private final AdSalesSignboardService salesService;

    /** 查询可购买格子（标签 x 日期）+ 标签计价信息 */
    @GetMapping("/inventory")
    @RequirePermission(menu = "ad-sales")
    public Result<AdSignboardInventoryVO> inventory(@RequestParam Long algoId,
                                                    @RequestParam(required = false) String storeCode,
                                                    @RequestParam(required = false) String groupCode) {
        return Result.success(salesService.inventory(algoId, storeCode, groupCode));
    }

    /** 提交订单并从推广金账户扣款 */
    @PostMapping("/order")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdSignboardOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

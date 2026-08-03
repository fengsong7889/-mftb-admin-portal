package com.mftb.admin.controller;

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

    /** 查询可购买格子（商圈 x 日期 x 餐段） */
    @GetMapping("/inventory")
    public Result<AdInventoryVO> inventory(@RequestParam Long algoId) {
        return Result.success(salesService.inventory(algoId));
    }

    /** 提交订单并从推广金账户扣款 */
    @PostMapping("/order")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdStarOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

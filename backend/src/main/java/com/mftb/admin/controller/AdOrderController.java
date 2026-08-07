package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdOrderDetailVO;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AdOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 推广广告订单接口（订单查询 + 退款）
 */
@RestController
@RequestMapping("/api/ad/orders")
@RequiredArgsConstructor
public class AdOrderController {

    private final AdOrderService orderService;

    /** 订单分页查询 */
    @GetMapping
    @RequirePermission(menu = "promotion-order-manage")
    public Result<PageResult<AdOrderVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) Integer algoType,
            @RequestParam(required = false) String groupCode,
            @RequestParam(required = false) String storeCode,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(orderService.page(page, size, orderNo, algoType, groupCode, storeCode,
                status, startDate, endDate));
    }

    /** 订单详情（含明细） */
    @GetMapping("/{orderNo}")
    @RequirePermission(menu = "promotion-order-manage")
    public Result<AdOrderDetailVO> detail(@PathVariable String orderNo) {
        return Result.success(orderService.detail(orderNo));
    }

    /** 退款 */
    @PostMapping("/{orderNo}/refund")
    @RequirePermission(menu = "promotion-order-manage", action = "edit")
    public Result<AdOrderDetailVO> refund(@PathVariable String orderNo) {
        return Result.success("退款成功", orderService.refund(orderNo));
    }
}

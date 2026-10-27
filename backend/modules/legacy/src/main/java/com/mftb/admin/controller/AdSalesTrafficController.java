package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.dto.AdTrafficOrderRequest;
import com.mftb.admin.service.AdSalesTrafficService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 投流广告销售接口（流量包购买下单）
 * <p>
 * 流量包不限库存，无需库存查询接口；订单查询/退款走统一订单接口 /api/ad/order。
 */
@RestController
@RequestMapping("/api/ad/sales/traffic")
@RequiredArgsConstructor
public class AdSalesTrafficController {

    private final AdSalesTrafficService salesService;

    /** 提交订单并从推广金账户扣款（支持赠送天数抵扣） */
    @PostMapping("/order")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdTrafficOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

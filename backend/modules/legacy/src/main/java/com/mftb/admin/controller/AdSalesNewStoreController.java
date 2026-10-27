package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdNewStoreInventoryVO;
import com.mftb.admin.dto.AdNewStoreOrderRequest;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.service.AdSalesNewStoreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 新店广告销售接口（赠送天数查询 + 下单抵扣）
 * <p>
 * 无 lock/unlock 接口，新店广告无库存抢占。
 */
@RestController
@RequestMapping("/api/ad/sales/newstore")
@RequiredArgsConstructor
public class AdSalesNewStoreController {

    private final AdSalesNewStoreService salesService;

    /** 查询门店赠送天数余额（= 可购买库存） */
    @GetMapping("/inventory")
    @RequirePermission(menu = "ad-sales")
    public Result<AdNewStoreInventoryVO> inventory(@RequestParam Long algoId,
                                                   @RequestParam String storeCode) {
        return Result.success(salesService.inventory(algoId, storeCode));
    }

    /** 提交订单（赠送天数全额抵扣，无推广金扣款） */
    @PostMapping("/order")
    @RequirePermission(menu = "ad-sales", action = "create")
    public Result<AdOrderVO> placeOrder(@Valid @RequestBody AdNewStoreOrderRequest request) {
        return Result.success("下單成功", salesService.placeOrder(request));
    }
}

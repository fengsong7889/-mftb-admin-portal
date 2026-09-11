package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamPurchaseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * EAM 採購訂單控制器
 */
@RestController
@RequestMapping("/api/eam/purchase")
@RequiredArgsConstructor
public class EamPurchaseController {

    private static final String MENU = "purchase-order";

    private final EamPurchaseService purchaseService;

    /** 分頁查詢採購訂單 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<Map<String, Object>>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String poNo,
            @RequestParam(required = false) String supplier,
            @RequestParam(required = false) String purchaser,
            @RequestParam(required = false) String execStatus,
            @RequestParam(required = false) String createdAtStart,
            @RequestParam(required = false) String createdAtEnd,
            @RequestParam(required = false) String updatedAtStart,
            @RequestParam(required = false) String updatedAtEnd) {
        return Result.success(purchaseService.pageOrders(
                page, size, poNo, supplier, purchaser, execStatus,
                createdAtStart, createdAtEnd, updatedAtStart, updatedAtEnd));
    }

    /** 採購訂單詳情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Object>> detail(@PathVariable long id) {
        return Result.success(purchaseService.getOrderDetail(id));
    }

    /** 創建採購訂單（直接錄入） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> create(@RequestBody Map<String, Object> data) {
        return Result.success(purchaseService.createOrder(data));
    }

    /** 更新採購訂單執行信息 */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> updateExec(@PathVariable long id, @RequestBody Map<String, Object> data) {
        purchaseService.updateOrderExec(id, data);
        return Result.success();
    }

    /** 刪除採購訂單 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Void> delete(@PathVariable long id) {
        purchaseService.deleteOrder(id);
        return Result.success();
    }
}

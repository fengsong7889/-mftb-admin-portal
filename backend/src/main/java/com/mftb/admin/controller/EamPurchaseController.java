package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamPurchaseSaveDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamPurchaseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * EAM 采购订单控制器
 */
@RestController
@RequestMapping("/api/eam/purchase")
@RequiredArgsConstructor
public class EamPurchaseController {

    private static final String MENU = "purchase-order";

    private final EamPurchaseService purchaseService;

    /** 分页查询采购订单 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<Map<String, Object>>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String poNo,
            @RequestParam(required = false) String processNo,
            @RequestParam(required = false) String supplier,
            @RequestParam(required = false) String purchaser,
            @RequestParam(required = false) String execStatus,
            @RequestParam(required = false) String createdAtStart,
            @RequestParam(required = false) String createdAtEnd,
            @RequestParam(required = false) String updatedAtStart,
            @RequestParam(required = false) String updatedAtEnd) {
        return Result.success(purchaseService.pageOrders(
                page, size, poNo, processNo, supplier, purchaser, execStatus,
                createdAtStart, createdAtEnd, updatedAtStart, updatedAtEnd));
    }

    /** 采购订单详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Object>> detail(@PathVariable long id) {
        return Result.success(purchaseService.getOrderDetail(id));
    }

    /** 创建采购订单（直接录入） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> create(@RequestBody EamPurchaseSaveDTO dto) {
        return Result.success(purchaseService.createOrder(dto));
    }

    /** 更新采购订单执行信息 */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> updateExec(@PathVariable long id, @RequestBody EamPurchaseSaveDTO dto) {
        purchaseService.updateOrderExec(id, dto);
        return Result.success();
    }

    /** 删除采购订单 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Void> delete(@PathVariable long id) {
        purchaseService.deleteOrder(id);
        return Result.success();
    }
}

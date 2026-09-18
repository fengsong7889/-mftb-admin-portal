package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamConsumableService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 耗材管理接口（主数据 / 库存 / 流水 / 入库 / 预警 / 看板）
 */
@RestController
@RequestMapping("/api/eam/consumables")
@RequiredArgsConstructor
public class EamConsumableController {

    private final EamConsumableService consumableService;

    /* ===== 看板 ===== */
    @GetMapping("/dashboard")
    @RequirePermission(menu = "consumable-dashboard")
    public Result<EamConsumableDashboardVO> dashboard() {
        return Result.success(consumableService.dashboard());
    }

    /* ===== 主数据 ===== */
    @GetMapping("/items")
    @RequirePermission(menu = "consumable-item")
    public Result<PageResult<EamConsumableItemVO>> pageItems(@ModelAttribute EamConsumableItemQuery query) {
        return Result.success(consumableService.pageItems(query));
    }

    /** 下拉选项（领用/入库选品用，登录即可，无需管理权限） */
    @GetMapping("/items/options")
    public Result<List<EamConsumableItemVO>> itemOptions() {
        return Result.success(consumableService.itemOptions());
    }

    @GetMapping("/items/{id}")
    @RequirePermission(menu = "consumable-item")
    public Result<EamConsumableItemVO> itemDetail(@PathVariable long id) {
        return Result.success(consumableService.itemDetail(id));
    }

    @PostMapping("/items")
    @RequirePermission(menu = "consumable-item", action = "create")
    public Result<Long> createItem(@RequestBody EamConsumableItemSaveDTO dto) {
        return Result.success(consumableService.createItem(dto));
    }

    @PutMapping("/items/{id}")
    @RequirePermission(menu = "consumable-item", action = "edit")
    public Result<Void> updateItem(@PathVariable long id, @RequestBody EamConsumableItemSaveDTO dto) {
        consumableService.updateItem(id, dto);
        return Result.success();
    }

    @PutMapping("/items/{id}/status")
    @RequirePermission(menu = "consumable-item", action = "edit")
    public Result<Void> toggleItemStatus(@PathVariable long id, @RequestBody Map<String, String> body) {
        consumableService.toggleItemStatus(id, body.get("status"));
        return Result.success();
    }

    @DeleteMapping("/items/{id}")
    @RequirePermission(menu = "consumable-item", action = "delete")
    public Result<Void> deleteItem(@PathVariable long id) {
        consumableService.deleteItem(id);
        return Result.success();
    }

    /* ===== 库存 ===== */
    @GetMapping("/stock")
    @RequirePermission(menu = "consumable-stock")
    public Result<List<EamConsumableStockVO>> stockList(@RequestParam(required = false) Long itemId,
                                                        @RequestParam(required = false) Long locationId) {
        return Result.success(consumableService.stockList(itemId, locationId));
    }

    /** 手工入库 / 期初建账 */
    @PostMapping("/inbound")
    @RequirePermission(menu = "consumable-stock", action = "edit")
    public Result<Void> inbound(@RequestBody EamConsumableInboundDTO dto) {
        consumableService.inbound(dto);
        return Result.success();
    }

    /* ===== 流水 ===== */
    @GetMapping("/txns")
    @RequirePermission(menu = "consumable-stock")
    public Result<List<EamConsumableTxnVO>> txns(@RequestParam(required = false) Long itemId,
                                                 @RequestParam(required = false) Long locationId,
                                                 @RequestParam(required = false) Integer limit) {
        return Result.success(consumableService.txns(itemId, locationId, limit));
    }

    /* ===== 预警 ===== */
    @GetMapping("/alerts")
    @RequirePermission(menu = "consumable-alert")
    public Result<List<EamConsumableItemVO>> alerts() {
        return Result.success(consumableService.alerts());
    }
}

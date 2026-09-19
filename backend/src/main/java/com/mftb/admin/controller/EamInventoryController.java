package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamInventoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 资产盘点管理接口
 * <p>
 * 管理端点（列表/详情/创建/提交/取消）需 asset-inventory 权限。
 */
@RestController
@RequestMapping("/api/eam/inventory")
@RequiredArgsConstructor
public class EamInventoryController {

    private static final String MENU = "asset-inventory";
    private final EamInventoryService inventoryService;

    /** 盘点任务分页列表 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamInventoryTaskVO>> page(EamInventoryQuery query) {
        return Result.success(inventoryService.page(query));
    }

    /** 盘点任务详情（含明细列表） */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamInventoryTaskVO> detail(@PathVariable long id) {
        return Result.success(inventoryService.detail(id));
    }

    /** 创建盘点任务 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "create")
    public Result<String> create(@RequestBody EamInventoryCreateDTO dto) {
        return Result.success(inventoryService.create(dto));
    }

    /** 提交盘点结果 */
    @PostMapping("/submit")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Void> submit(@RequestBody EamInventorySubmitDTO dto) {
        inventoryService.submit(dto);
        return Result.success();
    }

    /** 取消盘点任务 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Void> cancel(@PathVariable long id) {
        inventoryService.cancel(id);
        return Result.success();
    }
}

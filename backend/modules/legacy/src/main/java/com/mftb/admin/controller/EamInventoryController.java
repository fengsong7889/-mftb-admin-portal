package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamInventoryService;
import com.mftb.admin.service.EamTransferLookup;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 资产盘点管理接口（v2）。
 * <p>读操作需 asset-inventory view；写操作需 create；导出需 export。
 * 选项/员工检索仅返回菜单所需最小数据集，不要求员工管理等无关菜单权限。</p>
 */
@RestController
@RequestMapping("/api/eam/inventory")
@RequiredArgsConstructor
public class EamInventoryController {

    private static final String MENU = "asset-inventory";
    private final EamInventoryService inventoryService;
    private final EamTransferLookup lookup;

    /** 盘点选项（仓库/分类/部门/状态） */
    @GetMapping("/v2/options")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Map<String, Object>> options() {
        return Result.success(inventoryService.options());
    }

    /** 员工检索（列表按负责人筛选 / 发起选负责人 / 核对选实际持有人），查看权限即可用 */
    @GetMapping("/v2/employees")
    @RequirePermission(menu = MENU)
    public Result<List<EamTransferOptionsVO.EmployeeOption>> employees(@RequestParam(required = false) String keyword) {
        return Result.success(lookup.employees(keyword));
    }

    /** 范围预览 */
    @PostMapping("/v2/preview")
    @RequirePermission(menu = MENU, action = "create")
    public Result<EamInventoryPreviewVO> preview(@RequestBody InventoryScope scope) {
        return Result.success(inventoryService.preview(scope));
    }

    /** 任务分页 */
    @GetMapping("/v2/tasks")
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamInventoryTaskVO>> page(EamInventoryQuery query) {
        return Result.success(inventoryService.page(query));
    }

    /** 任务详情 */
    @GetMapping("/v2/tasks/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamInventoryTaskVO> detail(@PathVariable long id) {
        return Result.success(inventoryService.detail(id));
    }

    /** 明细分页 */
    @GetMapping("/v2/tasks/{id}/items")
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamInventoryItemVO>> items(@PathVariable long id, EamInventoryItemQuery query) {
        return Result.success(inventoryService.items(id, query));
    }

    /** 操作日志 */
    @GetMapping("/v2/tasks/{id}/events")
    @RequirePermission(menu = MENU)
    public Result<List<EamInventoryEventVO>> events(@PathVariable long id) {
        return Result.success(inventoryService.events(id));
    }

    /** 创建任务 */
    @PostMapping("/v2/tasks")
    @RequirePermission(menu = MENU, action = "create")
    public Result<EamInventoryCreatedVO> create(@RequestBody EamInventoryCreateDTO dto) {
        return Result.success(inventoryService.create(dto));
    }

    /** 保存/重置单条明细核对结果 */
    @PutMapping("/v2/tasks/{id}/items/{itemId}")
    @RequirePermission(menu = MENU, action = "create")
    public Result<EamInventoryItemVO> saveItem(@PathVariable long id, @PathVariable long itemId,
                                               @RequestBody EamInventoryItemCheckDTO dto) {
        return Result.success(inventoryService.saveItem(id, itemId, dto));
    }

    /** 批量核对 */
    @PostMapping("/v2/tasks/{id}/items/batch-check")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Integer> batchCheck(@PathVariable long id, @RequestBody EamInventoryBatchCheckDTO dto) {
        return Result.success(inventoryService.batchCheck(id, dto));
    }

    /** 结束预检查 */
    @PostMapping("/v2/tasks/{id}/prepare-close")
    @RequirePermission(menu = MENU, action = "create")
    public Result<EamInventoryPrepareCloseVO> prepareClose(@PathVariable long id) {
        return Result.success(inventoryService.prepareClose(id));
    }

    /** 结束任务（完整/部分完成） */
    @PostMapping("/v2/tasks/{id}/complete")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Void> complete(@PathVariable long id, @RequestBody EamInventoryCloseDTO dto) {
        inventoryService.complete(id, dto);
        return Result.success();
    }

    /** 取消任务 */
    @PostMapping("/v2/tasks/{id}/cancel")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Void> cancel(@PathVariable long id, @RequestBody EamInventoryCancelDTO dto) {
        inventoryService.cancel(id, dto);
        return Result.success();
    }

    /** 任务列表导出 */
    @GetMapping("/v2/tasks/export")
    @RequirePermission(menu = MENU, action = "export")
    public ResponseEntity<byte[]> exportTasks(EamInventoryQuery query) {
        return csv(inventoryService.exportTasksCsv(query), "asset_inventory_tasks_" + LocalDate.now());
    }

    /** 报告导出 */
    @GetMapping("/v2/tasks/{id}/export")
    @RequirePermission(menu = MENU, action = "export")
    public ResponseEntity<byte[]> exportReport(@PathVariable long id, @RequestParam(required = false, defaultValue = "all") String mode) {
        return csv(inventoryService.exportReportCsv(id, mode), "asset_inventory_report_" + id);
    }

    private ResponseEntity<byte[]> csv(String content, String filename) {
        byte[] body = ("﻿" + content).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + ".csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }
}

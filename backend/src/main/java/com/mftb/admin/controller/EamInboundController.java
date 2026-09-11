package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamInboundService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * EAM 驗收入庫控制器
 */
@RestController
@RequestMapping("/api/eam/inbound")
@RequiredArgsConstructor
public class EamInboundController {

    private static final String MENU = "asset-inbound";

    private final EamInboundService inboundService;

    /** 分頁查詢入庫批次 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<Map<String, Object>>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Result.success(inboundService.pageBatches(page, size));
    }

    /** 入庫批次詳情 */
    @GetMapping("/{batchId}")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Object>> detail(@PathVariable long batchId) {
        return Result.success(inboundService.getBatchDetail(batchId));
    }

    /** 創建入庫批次（驗收入庫提交） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> data) {
        return Result.success(inboundService.createBatch(data));
    }
}

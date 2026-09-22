package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamConsumableDocService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 耗材单据管理接口（退料 / 库存调整 / 仓库调拨 / 入库单 CRUD）
 */
@RestController
@RequestMapping("/api/eam/consumables")
@RequiredArgsConstructor
public class EamConsumableDocController {

    private final EamConsumableDocService docService;

    /* ===== 退料 ===== */
    @GetMapping("/returns")
    @RequirePermission(menu = "consumable-claim")
    public Result<PageResult<EamConsumableReturnVO>> pageReturns(@ModelAttribute EamConsumableReturnQuery query) {
        return Result.success(docService.pageReturns(query));
    }

    @PostMapping("/returns")
    @RequirePermission(menu = "consumable-claim", action = "create")
    public Result<Long> createReturn(@RequestBody EamConsumableReturnSaveDTO dto) {
        return Result.success(docService.createReturn(dto));
    }

    /* ===== 库存调整（盘盈/盘亏） ===== */
    @GetMapping("/adjusts")
    @RequirePermission(menu = "consumable-stock")
    public Result<PageResult<EamConsumableAdjustVO>> pageAdjusts(@ModelAttribute EamConsumableAdjustQuery query) {
        return Result.success(docService.pageAdjusts(query));
    }

    @PostMapping("/adjusts")
    @RequirePermission(menu = "consumable-stock", action = "edit")
    public Result<Long> createAdjust(@RequestBody EamConsumableAdjustSaveDTO dto) {
        return Result.success(docService.createAdjust(dto));
    }

    /* ===== 仓库调拨 ===== */
    @GetMapping("/transfers")
    @RequirePermission(menu = "consumable-stock")
    public Result<PageResult<EamConsumableTransferVO>> pageTransfers(@ModelAttribute EamConsumableTransferQuery query) {
        return Result.success(docService.pageTransfers(query));
    }

    @PostMapping("/transfers")
    @RequirePermission(menu = "consumable-stock", action = "edit")
    public Result<Long> createTransfer(@RequestBody EamConsumableTransferSaveDTO dto) {
        return Result.success(docService.createTransfer(dto));
    }

    /* ===== 入库单 CRUD ===== */
    @GetMapping("/inbound-orders")
    @RequirePermission(menu = "consumable-inbound")
    public Result<PageResult<EamConsumableInboundVO>> pageInbounds(@ModelAttribute EamConsumableInboundQuery query) {
        return Result.success(docService.pageInbounds(query));
    }

    @GetMapping("/inbound-orders/{id}")
    @RequirePermission(menu = "consumable-inbound")
    public Result<EamConsumableInboundVO> inboundDetail(@PathVariable long id) {
        return Result.success(docService.inboundDetail(id));
    }

    @PostMapping("/inbound-orders")
    @RequirePermission(menu = "consumable-inbound", action = "create")
    public Result<Long> createInbound(@RequestBody EamConsumableInboundSaveDTO dto) {
        return Result.success(docService.createInbound(dto));
    }
}

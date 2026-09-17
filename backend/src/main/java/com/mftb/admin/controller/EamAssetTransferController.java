package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamAssetTransferService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 资产调拨接口
 * <p>
 * 菜单：asset-transfer-list（調撥管理）
 * <p>
 * 与交接（EamHandoverController）互补：交接 = 批量人A→人B；调拨 = 单件资产归属变更。
 */
@RestController
@RequestMapping("/api/eam/transfers")
@RequiredArgsConstructor
public class EamAssetTransferController {

    private static final String MENU = "asset-transfer-list";
    private final EamAssetTransferService transferService;

    /** 分页查询调拨记录 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamAssetTransferVO>> page(@ModelAttribute EamAssetTransferQuery query) {
        return Result.success(transferService.page(query));
    }

    /** 调拨详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamAssetTransferVO> detail(@PathVariable long id) {
        return Result.success(transferService.detail(id));
    }

    /** 登记调拨 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> register(@RequestBody EamAssetTransferSaveDTO dto) {
        return Result.success(transferService.register(dto));
    }

    /** 取消调拨 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> cancel(@PathVariable long id, @RequestBody Map<String, String> body) {
        transferService.cancel(id, body.get("reason"));
        return Result.success();
    }
}

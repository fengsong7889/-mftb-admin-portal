package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamLossService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 资产遗失找回接口
 * <p>
 * 管理端点（列表/详情/报失/找回/验收/核销/跟进）需 asset-loss 权限。
 */
@RestController
@RequestMapping("/api/eam/losses")
@RequiredArgsConstructor
public class EamLossController {

    private static final String MENU = "asset-loss";
    private final EamLossService lossService;

    /** 遗失单分页列表 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamLossVO>> page(@ModelAttribute EamLossQuery query) {
        return Result.success(lossService.page(query));
    }

    /** 遗失单详情（含事件日志） */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamLossVO> detail(@PathVariable long id) {
        return Result.success(lossService.detail(id));
    }

    /** 主动报失（新建遗失单） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "create")
    public Result<Long> create(@RequestBody EamLossSaveDTO dto) {
        return Result.success(lossService.create(dto));
    }

    /** 编辑遗失单资料（仅 searching 状态） */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> update(@PathVariable long id, @RequestBody EamLossSaveDTO dto) {
        lossService.update(id, dto);
        return Result.success();
    }

    /** 登记找回 */
    @PostMapping("/{id}/recover")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> recover(@PathVariable long id, @RequestBody EamLossRecoverDTO dto) {
        lossService.recover(id, dto);
        return Result.success();
    }

    /** 验收处置 */
    @PostMapping("/{id}/inspect")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> inspect(@PathVariable long id, @RequestBody EamLossInspectDTO dto) {
        lossService.inspect(id, dto);
        return Result.success();
    }

    /** 遗失核销 */
    @PostMapping("/{id}/write-off")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> writeOff(@PathVariable long id, @RequestBody EamLossWriteOffDTO dto) {
        lossService.writeOff(id, dto);
        return Result.success();
    }

    /** 追加跟进事件 */
    @PostMapping("/{id}/events")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> addEvent(@PathVariable long id, @RequestBody EamLossEventDTO dto) {
        return Result.success(lossService.addEvent(id, dto));
    }
}

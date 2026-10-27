package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamReturnService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 归还管理接口
 */
@RestController
@RequestMapping("/api/eam/returns")
@RequiredArgsConstructor
public class EamReturnController {

    private static final String MENU = "asset-return";
    private final EamReturnService returnService;

    /** 分页查询 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamReturnVO>> page(@ModelAttribute EamReturnQuery query) {
        return Result.success(returnService.page(query));
    }

    /** 详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamReturnVO> detail(@PathVariable long id) {
        return Result.success(returnService.detail(id));
    }

    /** 按领用 ID 查最新归还记录（领用详情「归还信息」模块；权限跟随领用菜单） */
    @GetMapping("/by-claim/{claimId}")
    @RequirePermission(menu = "asset-claim")
    public Result<EamReturnVO> byClaim(@PathVariable long claimId) {
        return Result.success(returnService.byClaim(claimId));
    }

    /** 登记归还 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> register(@RequestBody EamReturnDTO dto) {
        return Result.success(returnService.register(dto));
    }

    /** 处置登记 */
    @PostMapping("/{id}/dispose")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> dispose(@PathVariable long id, @RequestBody EamReturnDispositionDTO dto) {
        dto.setReturnId(id);
        returnService.dispose(dto);
        return Result.success();
    }

    /** 遗失找回 */
    @PostMapping("/{id}/recover")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> recover(@PathVariable long id, @RequestBody EamReturnRecoverDTO dto) {
        dto.setReturnId(id);
        returnService.recover(dto);
        return Result.success();
    }
}

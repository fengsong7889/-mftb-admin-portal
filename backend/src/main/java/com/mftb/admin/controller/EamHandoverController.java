package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamHandoverService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 交接管理接口
 */
@RestController
@RequestMapping("/api/eam/handovers")
@RequiredArgsConstructor
public class EamHandoverController {

    private static final String MENU = "asset-handover";
    private final EamHandoverService handoverService;

    /** 分页查询 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamHandoverVO>> page(@ModelAttribute EamHandoverQuery query) {
        return Result.success(handoverService.page(query));
    }

    /** 详情（含明细） */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamHandoverVO> detail(@PathVariable long id) {
        return Result.success(handoverService.detail(id));
    }

    /** 登记交接 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> register(@RequestBody EamHandoverSaveDTO dto) {
        return Result.success(handoverService.register(dto));
    }

    /** 取消交接 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> cancel(@PathVariable long id, @RequestBody Map<String, String> body) {
        handoverService.cancel(id, body.get("reason"));
        return Result.success();
    }
}

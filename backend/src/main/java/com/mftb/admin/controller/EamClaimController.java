package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamClaimService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 领用管理接口
 */
@RestController
@RequestMapping("/api/eam/claims")
@RequiredArgsConstructor
public class EamClaimController {

    private static final String MENU = "asset-claim";
    private final EamClaimService claimService;

    /** 管理视图分页查询 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamClaimVO>> page(@ModelAttribute EamClaimQuery query) {
        return Result.success(claimService.page(query));
    }

    /** 领用统计 */
    @GetMapping("/stats")
    @RequirePermission(menu = MENU)
    public Result<EamClaimStatsVO> stats(@ModelAttribute EamClaimQuery query) {
        return Result.success(claimService.stats(query));
    }

    /** 员工领用汇总 */
    @GetMapping("/employee-summary")
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamClaimEmployeeSummaryVO>> employeeSummary(@ModelAttribute EamClaimQuery query) {
        return Result.success(claimService.employeeSummary(query));
    }

    /** 可选领用人下拉（仅要求领用资产菜单权限，不要求员工管理权限，支持选择本人登记；employeeId 用于深链预填） */
    @GetMapping("/employee-options")
    @RequirePermission(menu = MENU)
    public Result<List<EamClaimEmployeeOptionVO>> employeeOptions(@RequestParam(required = false) String keyword,
                                                                  @RequestParam(required = false) Long employeeId) {
        return Result.success(claimService.employeeOptions(keyword, employeeId));
    }

    /** 领用详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamClaimVO> detail(@PathVariable long id) {
        return Result.success(claimService.detail(id));
    }

    /** 领用事件流水 */
    @GetMapping("/{id}/events")
    @RequirePermission(menu = MENU)
    public Result<List<EamClaimEventVO>> events(@PathVariable long id) {
        return Result.success(claimService.events(id));
    }

    /** 登记领用 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> register(@RequestBody EamClaimSaveDTO dto) {
        return Result.success(claimService.register(dto));
    }

    /** 员工签署 */
    @PostMapping("/sign")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> sign(@RequestBody EamSignDTO dto) {
        claimService.sign(dto);
        return Result.success();
    }

    /** 取消领用 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> cancel(@PathVariable long id, @RequestBody Map<String, String> body) {
        claimService.cancel(id, body.get("reason"));
        return Result.success();
    }

    /** 归还资产 */
    @PostMapping("/return")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> returnAsset(@RequestBody EamReturnDTO dto) {
        return Result.success(claimService.returnAsset(dto));
    }

    /** 本人签署不授予管理权限；服务层强制核对记录归属。 */
    @PostMapping("/my/sign")
    public Result<Void> mySign(@RequestBody EamSignDTO dto) {
        claimService.sign(dto);
        return Result.success();
    }

    @GetMapping("/my/{id}")
    public Result<EamClaimVO> myDetail(@PathVariable long id) {
        return Result.success(claimService.myDetail(id));
    }

    /** 个人领用列表（当前登录用户） */
    @GetMapping("/my")
    public Result<PageResult<EamClaimVO>> myClaims(@ModelAttribute EamClaimQuery query) {
        return Result.success(claimService.myClaims(query));
    }

    /** 重新推送签署通知（管理员手动触发，不限签署状态） */
    @PostMapping("/{id}/resend-sign-notify")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> resendSignNotify(@PathVariable long id) {
        claimService.resendSignNotification(id);
        return Result.success();
    }
}

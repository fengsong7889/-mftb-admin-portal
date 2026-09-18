package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamConsumableClaimService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 耗材领用接口（申请 → 审批 → 出库核销，无归还流程）
 * <p>
 * 自助端点（提交/我的领用/撤销本人单）不授予管理权限，服务层强制核对归属；
 * 管理端点（全量分页/详情/审批/出库）需 consumable-claim 权限。
 */
@RestController
@RequestMapping("/api/eam/consumables/claims")
@RequiredArgsConstructor
public class EamConsumableClaimController {

    private final EamConsumableClaimService claimService;

    /* ===== 管理视图 ===== */
    @GetMapping
    @RequirePermission(menu = "consumable-claim")
    public Result<PageResult<EamConsumableClaimVO>> page(@ModelAttribute EamConsumableClaimQuery query) {
        return Result.success(claimService.page(query));
    }

    @GetMapping("/{id}")
    @RequirePermission(menu = "consumable-claim")
    public Result<EamConsumableClaimVO> detail(@PathVariable long id) {
        return Result.success(claimService.detail(id));
    }

    /** 审批（通过/驳回） */
    @PostMapping("/approve")
    @RequirePermission(menu = "consumable-claim", action = "edit")
    public Result<Void> approve(@RequestBody EamConsumableApproveDTO dto) {
        claimService.approve(dto);
        return Result.success();
    }

    /** 出库核销 */
    @PostMapping("/{id}/issue")
    @RequirePermission(menu = "consumable-claim", action = "edit")
    public Result<Void> issue(@PathVariable long id) {
        claimService.issue(id);
        return Result.success();
    }

    /* ===== 自助视图（登录即可，服务层核对归属） ===== */
    @GetMapping("/my")
    public Result<PageResult<EamConsumableClaimVO>> myClaims(@ModelAttribute EamConsumableClaimQuery query) {
        return Result.success(claimService.myClaims(query));
    }

    @GetMapping("/my/{id}")
    public Result<EamConsumableClaimVO> myDetail(@PathVariable long id) {
        return Result.success(claimService.myDetail(id));
    }

    /** 提交领用申请 */
    @PostMapping("/my")
    public Result<Long> submit(@RequestBody EamConsumableClaimSaveDTO dto) {
        return Result.success(claimService.submit(dto));
    }

    /** 撤销（本人或管理员，服务层校验） */
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable long id, @RequestBody(required = false) Map<String, String> body) {
        claimService.cancel(id, body == null ? null : body.get("reason"));
        return Result.success();
    }
}

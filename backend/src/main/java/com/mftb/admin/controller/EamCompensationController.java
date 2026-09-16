package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamCompensationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 赔付管理接口
 */
@RestController
@RequestMapping("/api/eam/compensations")
@RequiredArgsConstructor
public class EamCompensationController {

    private static final String MENU = "asset-compensation";
    private final EamCompensationService compensationService;

    /** 分页查询 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamCompensationVO>> page(@ModelAttribute EamCompensationQuery query) {
        return Result.success(compensationService.page(query));
    }

    /** 详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamCompensationVO> detail(@PathVariable long id) {
        return Result.success(compensationService.detail(id));
    }

    /** 定责 */
    @PostMapping("/{id}/liability")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> setLiability(@PathVariable long id, @RequestBody EamCompensationLiabilityDTO dto) {
        dto.setCompensationId(id);
        compensationService.setLiability(dto);
        return Result.success();
    }

    /** 免赔 */
    @PostMapping("/{id}/waive")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> waive(@PathVariable long id, @RequestBody EamCompensationWaiveDTO dto) {
        dto.setCompensationId(id);
        compensationService.waive(dto);
        return Result.success();
    }

    /** 收款/退款 */
    @PostMapping("/{id}/payment")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> addPayment(@PathVariable long id, @RequestBody EamCompensationPaymentDTO dto) {
        dto.setCompensationId(id);
        compensationService.addPayment(dto);
        return Result.success();
    }

    /** 找回复核 */
    @PostMapping("/{id}/review")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> review(@PathVariable long id, @RequestBody EamCompensationReviewDTO dto) {
        dto.setCompensationId(id);
        compensationService.review(dto);
        return Result.success();
    }
}

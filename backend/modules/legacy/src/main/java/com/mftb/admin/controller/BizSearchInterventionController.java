package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.BizSearchIntervention;
import com.mftb.admin.service.BizSearchInterventionService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 搜索商家干预接口（方案 §5.1「商家干预」）。审批为高影响动作，独立 action=approve 门控。
 */
@RestController
@RequestMapping("/api/search/intervention")
@RequiredArgsConstructor
@Tag(name = "搜索运营 - 商家干预", description = "搜索商家干预规则接口")
public class BizSearchInterventionController {

    private static final String MENU = "global-config";

    private final BizSearchInterventionService interventionService;
    private final OperatorResolver operatorResolver;

    @GetMapping
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询干预规则")
    public Result<List<BizSearchIntervention>> list(@RequestParam(required = false) Integer actionType,
                                                    @RequestParam(required = false) Integer approvalStatus,
                                                    @RequestParam(required = false) Integer status) {
        return Result.success(interventionService.list(actionType, approvalStatus, status));
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增干预规则")
    public Result<Long> create(@RequestBody BizSearchIntervention rule) {
        return Result.success("創建成功", interventionService.create(rule));
    }

    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "更新干预规则（改内容需重新审批）")
    public Result<Void> update(@PathVariable Long id, @RequestBody BizSearchIntervention rule) {
        interventionService.update(id, rule);
        return Result.success();
    }

    @PostMapping("/{id}/approve")
    @RequirePermission(menu = MENU, action = "approve")
    @Operation(summary = "审批通过/驳回干预规则")
    public Result<Void> approve(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        boolean approved = Boolean.TRUE.equals(body.get("approved"));
        interventionService.approve(id, approved, operatorResolver.currentOperatorName());
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除干预规则（逻辑删除）")
    public Result<Void> delete(@PathVariable Long id) {
        interventionService.delete(id);
        return Result.success();
    }
}

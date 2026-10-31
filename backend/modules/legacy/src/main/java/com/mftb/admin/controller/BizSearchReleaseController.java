package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.BizSearchRelease;
import com.mftb.admin.service.BizSearchReleaseService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 搜索配置发布接口（方案 §5.1「配置发布」）。管理草稿→待审→批准；真实发布至 ES 属 B1，未提供伪生效接口。
 */
@RestController
@RequestMapping("/api/search/release")
@RequiredArgsConstructor
@Tag(name = "搜索运营 - 配置发布", description = "搜索配置发布版本接口")
public class BizSearchReleaseController {

    private static final String MENU = "global-config";

    private final BizSearchReleaseService releaseService;
    private final OperatorResolver operatorResolver;

    @GetMapping
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询发布版本")
    public Result<List<BizSearchRelease>> list(@RequestParam(required = false) Integer status) {
        return Result.success(releaseService.list(status));
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新建发布草稿")
    public Result<Long> create(@RequestBody BizSearchRelease release) {
        return Result.success("草稿已保存", releaseService.createDraft(release));
    }

    @PostMapping("/{id}/submit")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "提交审核")
    public Result<Void> submit(@PathVariable Long id) {
        releaseService.submitForReview(id);
        return Result.success();
    }

    @PostMapping("/{id}/approve")
    @RequirePermission(menu = MENU, action = "approve")
    @Operation(summary = "审批通过发布版本")
    public Result<Void> approve(@PathVariable Long id) {
        releaseService.approve(id, operatorResolver.currentOperatorName());
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除草稿/待审版本")
    public Result<Void> delete(@PathVariable Long id) {
        releaseService.delete(id);
        return Result.success();
    }
}

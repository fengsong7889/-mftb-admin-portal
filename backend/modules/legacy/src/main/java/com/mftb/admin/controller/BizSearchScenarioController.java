package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.BizSearchScenario;
import com.mftb.admin.service.BizSearchScenarioService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 搜索场景策略接口（方案 §5.1「场景策略」）。写操作按菜单级权限门控。
 */
@RestController
@RequestMapping("/api/search/scenario")
@RequiredArgsConstructor
@Tag(name = "搜索运营 - 场景策略", description = "搜索场景策略 CRUD 接口")
public class BizSearchScenarioController {

    private static final String MENU = "global-config";

    private final BizSearchScenarioService scenarioService;

    @GetMapping
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询场景策略")
    public Result<List<BizSearchScenario>> list(@RequestParam(required = false) Integer surface,
                                                @RequestParam(required = false) Integer bizChannel,
                                                @RequestParam(required = false) Integer status) {
        return Result.success(scenarioService.list(surface, bizChannel, status));
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增场景策略")
    public Result<Long> create(@RequestBody BizSearchScenario scenario) {
        return Result.success("創建成功", scenarioService.create(scenario));
    }

    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "更新场景策略")
    public Result<Void> update(@PathVariable Long id, @RequestBody BizSearchScenario scenario) {
        scenarioService.update(id, scenario);
        return Result.success();
    }

    @PutMapping("/{id}/status")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "启用/停用场景策略")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        scenarioService.updateStatus(id, status);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除场景策略（逻辑删除）")
    public Result<Void> delete(@PathVariable Long id) {
        scenarioService.delete(id);
        return Result.success();
    }
}

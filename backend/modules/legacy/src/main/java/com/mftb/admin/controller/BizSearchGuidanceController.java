package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.BizSearchGuidance;
import com.mftb.admin.service.BizSearchGuidanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 搜索引导配置接口（方案 §5.1「搜索引导」）。
 * <p>管理底纹词/自然热搜/推广搜索/候选热词。写操作按菜单级权限门控；真实发布/投放/计费接口尚未接入。
 * 权限暂挂既有搜索配置入口（global-config），专属 search-v2 菜单与权限随菜单注册一并重授予并测试（§5.3）。
 */
@RestController
@RequestMapping("/api/search/guidance")
@RequiredArgsConstructor
@Tag(name = "搜索运营 - 引导配置", description = "搜索引导词 CRUD 接口")
public class BizSearchGuidanceController {

    private static final String MENU = "global-config";

    private final BizSearchGuidanceService guidanceService;

    @GetMapping
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询搜索引导配置")
    public Result<List<BizSearchGuidance>> list(@RequestParam(required = false) Integer wordType,
                                                @RequestParam(required = false) String brand,
                                                @RequestParam(required = false) Integer surface,
                                                @RequestParam(required = false) Integer status) {
        return Result.success(guidanceService.list(wordType, brand, surface, status));
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增搜索引导配置")
    public Result<Long> create(@RequestBody BizSearchGuidance guidance) {
        return Result.success("創建成功", guidanceService.create(guidance));
    }

    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "更新搜索引导配置")
    public Result<Void> update(@PathVariable Long id, @RequestBody BizSearchGuidance guidance) {
        guidanceService.update(id, guidance);
        return Result.success();
    }

    @PutMapping("/{id}/status")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "启用/停用搜索引导配置")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        guidanceService.updateStatus(id, status);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除搜索引导配置（逻辑删除）")
    public Result<Void> delete(@PathVariable Long id) {
        guidanceService.delete(id);
        return Result.success();
    }
}

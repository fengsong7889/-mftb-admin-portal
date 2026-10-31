package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.BizSearchLexicon;
import com.mftb.admin.service.BizSearchLexiconService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 搜索词库接口（方案 §5.1「词库管理」）。写操作按菜单级权限门控；权限暂挂既有搜索配置入口。
 */
@RestController
@RequestMapping("/api/search/lexicon")
@RequiredArgsConstructor
@Tag(name = "搜索运营 - 词库", description = "搜索词库 CRUD 接口")
public class BizSearchLexiconController {

    private static final String MENU = "global-config";

    private final BizSearchLexiconService lexiconService;

    @GetMapping
    @RequirePermission(menu = MENU)
    @Operation(summary = "查询搜索词库")
    public Result<List<BizSearchLexicon>> list(@RequestParam(required = false) Integer wordType,
                                               @RequestParam(required = false) String brand,
                                               @RequestParam(required = false) Integer status) {
        return Result.success(lexiconService.list(wordType, brand, status));
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增词条")
    public Result<Long> create(@RequestBody BizSearchLexicon entry) {
        return Result.success("創建成功", lexiconService.create(entry));
    }

    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "更新词条")
    public Result<Void> update(@PathVariable Long id, @RequestBody BizSearchLexicon entry) {
        lexiconService.update(id, entry);
        return Result.success();
    }

    @PutMapping("/{id}/status")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "启用/停用词条")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        lexiconService.updateStatus(id, status);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除词条（逻辑删除）")
    public Result<Void> delete(@PathVariable Long id) {
        lexiconService.delete(id);
        return Result.success();
    }
}

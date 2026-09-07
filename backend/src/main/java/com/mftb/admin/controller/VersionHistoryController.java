package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VersionHistoryVO;
import com.mftb.admin.service.VersionHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * 版本发布历史记录接口
 */
@RestController
@RequestMapping("/api/version-history")
@RequiredArgsConstructor
public class VersionHistoryController {

    private final VersionHistoryService versionHistoryService;

    /** 分页查询版本记录 */
    @GetMapping
    @RequirePermission(menu = "version-history")
    public Result<PageResult<VersionHistoryVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String releaseType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Integer status) {
        return Result.success(versionHistoryService.list(page, size, keyword, releaseType, startDate, endDate, status));
    }

    /** 获取版本详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = "version-history")
    public Result<VersionHistoryVO> getById(@PathVariable Long id) {
        return Result.success(versionHistoryService.getById(id));
    }

    /** 新增版本记录 */
    @PostMapping
    @RequirePermission(menu = "version-history", action = "edit")
    public Result<Long> create(@RequestBody VersionHistoryVO vo) {
        return Result.success(versionHistoryService.create(vo, currentOperator()));
    }

    /** 更新版本记录 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "version-history", action = "edit")
    public Result<Void> update(@PathVariable Long id, @RequestBody VersionHistoryVO vo) {
        versionHistoryService.update(id, vo, currentOperator());
        return Result.success();
    }

    /** 删除版本记录 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "version-history", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        versionHistoryService.delete(id);
        return Result.success();
    }

    /** 从 Git 提交历史同步版本记录 */
    @PostMapping("/sync-from-git")
    @RequirePermission(menu = "version-history", action = "edit")
    public Result<String> syncFromGit() {
        String result = versionHistoryService.syncFromGit(currentOperator());
        return Result.success(result);
    }

    /** 根据发布类型建议下一个版本号 */
    @GetMapping("/suggest-next-version")
    @RequirePermission(menu = "version-history")
    public Result<String> suggestNextVersion(@RequestParam String releaseType) {
        return Result.success(versionHistoryService.suggestNextVersion(releaseType));
    }

    private String currentOperator() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            return auth != null ? auth.getName() : null;
        } catch (Exception e) {
            return null;
        }
    }
}

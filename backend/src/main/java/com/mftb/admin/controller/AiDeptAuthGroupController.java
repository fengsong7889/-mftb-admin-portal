package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiDeptAuthGroupDTO;
import com.mftb.admin.service.AiDeptAuthGroupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 部门模型授权策略管理控制器
 */
@RestController
@RequestMapping("/api/ai/auth/dept-groups")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 部门模型权控", description = "部门模型授权策略管理接口")
public class AiDeptAuthGroupController {

    /** 本菜单标识（sys_menu.menu_key），部门模型权控页 */
    private static final String MENU = "ai-dept-model-auth";

    private final AiDeptAuthGroupService deptAuthGroupService;

    /**
     * 获取策略列表
     */
    @GetMapping
    @Operation(summary = "查询部门模型授权策略列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiDeptAuthGroupDTO.GroupVO>> list(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Integer dataResidency) {
        return Result.success(deptAuthGroupService.list(name, dataResidency));
    }

    /**
     * 获取策略详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "获取策略详情")
    @RequirePermission(menu = MENU)
    public Result<AiDeptAuthGroupDTO.GroupDetailVO> detail(@PathVariable Long id) {
        AiDeptAuthGroupDTO.GroupDetailVO vo = deptAuthGroupService.detail(id);
        return vo != null ? Result.success(vo) : Result.error("策略不存在");
    }

    /**
     * 新增策略
     */
    @PostMapping
    @Operation(summary = "新增部门模型授权策略")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Boolean> create(@Valid @RequestBody AiDeptAuthGroupDTO.GroupSaveRequest request) {
        return Result.success(deptAuthGroupService.create(request));
    }

    /**
     * 编辑策略
     */
    @PutMapping("/{id}")
    @Operation(summary = "编辑部门模型授权策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> update(@PathVariable Long id,
                                  @Valid @RequestBody AiDeptAuthGroupDTO.GroupSaveRequest request) {
        boolean ok = deptAuthGroupService.update(id, request);
        return ok ? Result.success(true) : Result.error("策略不存在");
    }

    /**
     * 启停策略
     */
    @PutMapping("/{id}/status")
    @Operation(summary = "启停策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> toggleStatus(@PathVariable Long id, @RequestParam Integer status) {
        boolean ok = deptAuthGroupService.toggleStatus(id, status);
        return ok ? Result.success(true) : Result.error("策略不存在");
    }

    /**
     * 删除策略
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除策略")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> delete(@PathVariable Long id) {
        boolean ok = deptAuthGroupService.delete(id);
        return ok ? Result.success(true) : Result.error("策略不存在");
    }

    /**
     * 获取所有部门选项（供 Transfer 组件使用）
     */
    @GetMapping("/dept-options")
    @Operation(summary = "获取部门选项列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiDeptAuthGroupDTO.DeptOptionVO>> deptOptions() {
        return Result.success(deptAuthGroupService.deptOptions());
    }
}

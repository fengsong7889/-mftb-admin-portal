package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.BatchDataAuthorizationRequest;
import com.mftb.admin.dto.DataAuthorizationRequest;
import com.mftb.admin.dto.DataAuthorizationVO;
import com.mftb.admin.service.DataAuthorizationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 数据授权管理接口（角色/部门 → 可见商家范围）
 */
@RestController
@RequestMapping("/api/data-authorizations")
@RequiredArgsConstructor
public class DataAuthorizationController {

    private final DataAuthorizationService dataAuthorizationService;

    /** 查询数据授权列表 */
    @GetMapping
    @RequirePermission(menu = "data-permission")
    public Result<List<DataAuthorizationVO>> list(
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) Long targetId) {
        return Result.success(dataAuthorizationService.list(targetType, targetId));
    }

    /** 新增数据授权 */
    @PostMapping
    @RequirePermission(menu = "data-permission", action = "create")
    public Result<DataAuthorizationVO> create(@Valid @RequestBody DataAuthorizationRequest request) {
        return Result.success("數據授權創建成功", dataAuthorizationService.create(request));
    }

    /** 编辑数据授权 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "data-permission", action = "edit")
    public Result<DataAuthorizationVO> update(@PathVariable Long id, @Valid @RequestBody DataAuthorizationRequest request) {
        return Result.success("數據授權更新成功", dataAuthorizationService.update(id, request));
    }

    /** 删除数据授权 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "data-permission", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        dataAuthorizationService.delete(id);
        return Result.success();
    }

    /** 角色下拉选项（仅启用状态，数据权限页面专用） */
    @GetMapping("/role-options")
    @RequirePermission(menu = "data-permission")
    public Result<List<Map<String, Object>>> roleOptions() {
        return Result.success(dataAuthorizationService.roleOptions());
    }

    /** 部门下拉选项（数据权限页面专用） */
    @GetMapping("/department-options")
    @RequirePermission(menu = "data-permission")
    public Result<List<Map<String, Object>>> departmentOptions() {
        return Result.success(dataAuthorizationService.departmentOptions());
    }

    /** 商家集团下拉选项（数据权限页面专用） */
    @GetMapping("/merchant-group-options")
    @RequirePermission(menu = "data-permission")
    public Result<List<Map<String, Object>>> merchantGroupOptions() {
        return Result.success(dataAuthorizationService.merchantGroupOptions());
    }

    /** 诊断接口：检查数据授权相关表与字段是否就绪 */
    @GetMapping("/diagnose")
    @RequirePermission(menu = "data-permission")
    public Result<List<Map<String, Object>>> diagnose() {
        return Result.success(dataAuthorizationService.diagnose());
    }

    /** 批量新增数据授权 */
    @PostMapping("/batch")
    @RequirePermission(menu = "data-permission", action = "create")
    public Result<List<DataAuthorizationVO>> batchCreate(@Valid @RequestBody BatchDataAuthorizationRequest request) {
        return Result.success("批量數據授權創建成功", dataAuthorizationService.batchCreate(request));
    }

    /** 批量删除数据授权 */
    @DeleteMapping("/batch")
    @RequirePermission(menu = "data-permission", action = "delete")
    public Result<Void> batchDelete(@RequestBody Map<String, List<Long>> body) {
        List<Long> ids = body.get("ids");
        dataAuthorizationService.batchDelete(ids);
        return Result.success();
    }
}

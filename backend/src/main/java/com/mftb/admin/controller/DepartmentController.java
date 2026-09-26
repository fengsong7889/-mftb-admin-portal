package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.DepartmentRequest;
import com.mftb.admin.dto.DepartmentVO;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.service.DepartmentService;
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
 * 集团组织架构-部门接口
 */
@RestController
@RequestMapping("/api/departments")
@RequiredArgsConstructor
public class DepartmentController {

    private final DepartmentService departmentService;

    /** 查询全部部门 */
    @GetMapping
    @RequirePermission(menu = "org-structure")
    public Result<List<DepartmentVO>> list() {
        return Result.success(departmentService.list());
    }

    /** 新增部门 */
    @PostMapping
    @RequirePermission(menu = "org-structure", action = "create")
    public Result<DepartmentVO> create(@Valid @RequestBody DepartmentRequest request) {
        return Result.success("部門創建成功", departmentService.create(request));
    }

    /** 编辑部门 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "org-structure", action = "edit")
    public Result<DepartmentVO> update(@PathVariable Long id, @Valid @RequestBody DepartmentRequest request) {
        return Result.success("部門信息已更新", departmentService.update(id, request));
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "org-structure", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        departmentService.updateStatus(id, status);
        return Result.success();
    }

    /** 保存部门菜单权限 (部门授权·旧全量写入口，已由授权中心按系统原子写替代，保留兼容) */
    @PutMapping("/{id}/permissions")
    @RequirePermission(menu = "data-permission", action = "edit", anyOf = {"authorization-center"})
    public Result<Void> updatePermissions(@PathVariable Long id, @RequestBody List<MenuPermissionDTO> permissions) {
        departmentService.updatePermissions(id, permissions);
        return Result.success();
    }

    /** 删除部门 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "org-structure", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        departmentService.delete(id);
        return Result.success();
    }

    /** 批量翻译部门名称：将 nameEn 为空的部门按中文名自动翻译为英文 */
    @PostMapping("/translate-names")
    @RequirePermission(menu = "org-structure", action = "edit")
    public Result<Map<String, Integer>> translateNames() {
        int count = departmentService.translateNames();
        return Result.success("翻譯完成", Map.of("translated", count));
    }
}

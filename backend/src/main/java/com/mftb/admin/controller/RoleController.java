package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.BindUsersRequest;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.dto.RoleRequest;
import com.mftb.admin.dto.RoleVO;
import com.mftb.admin.service.RoleService;
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

/**
 * 功能角色接口
 */
@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    /** 查询全部角色 */
    @GetMapping
    @RequirePermission(menu = "role-management")
    public Result<List<RoleVO>> list() {
        return Result.success(roleService.list());
    }

    /** 新增角色 */
    @PostMapping
    @RequirePermission(menu = "role-management", action = "create")
    public Result<RoleVO> create(@Valid @RequestBody RoleRequest request) {
        return Result.success("角色创建成功", roleService.create(request));
    }

    /** 编辑角色基础信息 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "role-management", action = "edit")
    public Result<RoleVO> update(@PathVariable Long id, @Valid @RequestBody RoleRequest request) {
        return Result.success("角色信息已更新", roleService.update(id, request));
    }

    /** 保存角色菜单权限 */
    @PutMapping("/{id}/permissions")
    @RequirePermission(menu = "function-permission", action = "edit")
    public Result<Void> updatePermissions(@PathVariable Long id, @RequestBody List<MenuPermissionDTO> permissions) {
        roleService.updatePermissions(id, permissions);
        return Result.success();
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "role-management", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        roleService.updateStatus(id, status);
        return Result.success();
    }

    /** 删除角色 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "role-management", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        roleService.delete(id);
        return Result.success();
    }

    /** 查询绑定该角色的用户ID */
    @GetMapping("/{id}/users")
    @RequirePermission(menu = "role-management")
    public Result<List<Long>> boundUsers(@PathVariable Long id) {
        return Result.success(roleService.boundUserIds(id));
    }

    /** 全量设置绑定该角色的用户 */
    @PutMapping("/{id}/users")
    @RequirePermission(menu = "function-permission", action = "edit")
    public Result<Void> bindUsers(@PathVariable Long id, @RequestBody BindUsersRequest request) {
        roleService.bindUsers(id, request.getUserIds());
        return Result.success();
    }
}

package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.dto.SystemAuthorizationRequest;
import com.mftb.admin.dto.SystemAuthorizationVO;
import com.mftb.admin.entity.SysSystem;
import com.mftb.admin.mapper.SysSystemMapper;
import com.mftb.admin.service.SystemAuthorizationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统授权读写接口（Round 3 · 权限中心系统授权页对接）。
 * <p>路径以「目标 × 系统」为最小单位；同一目标在同一系统的准入 + 菜单授权一次事务保存，
 * 不影响其他系统的既有授权，与旧的 {@code /api/roles/{id}/permissions} 全量写接口分开。
 * <p>写权限沿用 {@code function-permission} 菜单动作 edit（角色）/ {@code data-permission} 菜单动作 edit（部门），
 * 与现有 {@link RoleController} / {@link DepartmentController} 保持一致，避免出现两套写入口的权限漂移。
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SystemAuthorizationController {

    private final SystemAuthorizationService systemAuthorizationService;
    private final SysSystemMapper sysSystemMapper;

    /**
     * 启用系统目录（供权限中心 “系统授权” Tab 数据源使用）。
     * <p>与 {@code /api/portal/context} 的区别：本接口不受当前用户系统准入限制，
     * 因为管理员需要能看到全部可配置系统；仅开放给 {@code function-permission:view} 持有者。
     */
    @GetMapping("/systems")
    @RequirePermission(menu = "function-permission")
    public Result<List<PortalSystemVO>> catalog() {
        List<SysSystem> all = sysSystemMapper.selectList(
                new LambdaQueryWrapper<SysSystem>()
                        .eq(SysSystem::getStatus, 1)
                        .orderByAsc(SysSystem::getSort));
        return Result.success(all.stream().map(PortalSystemVO::from).toList());
    }

    /** 读取角色在指定系统的授权快照。 */
    @GetMapping("/roles/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "function-permission")
    public Result<SystemAuthorizationVO> readRole(@PathVariable Long id, @PathVariable String code) {
        return Result.success(systemAuthorizationService.read(
                SystemAuthorizationService.TARGET_ROLE, id, code));
    }

    /** 原子保存角色在指定系统的准入 + 菜单授权。 */
    @PutMapping("/roles/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "function-permission", action = "edit")
    public Result<SystemAuthorizationVO> saveRole(@PathVariable Long id,
                                                   @PathVariable String code,
                                                   @RequestBody SystemAuthorizationRequest request) {
        return Result.success("系統授權已更新", systemAuthorizationService.save(
                SystemAuthorizationService.TARGET_ROLE, id, code, request));
    }

    /** 读取部门在指定系统的授权快照。 */
    @GetMapping("/departments/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "data-permission")
    public Result<SystemAuthorizationVO> readDepartment(@PathVariable Long id, @PathVariable String code) {
        return Result.success(systemAuthorizationService.read(
                SystemAuthorizationService.TARGET_DEPARTMENT, id, code));
    }

    /** 原子保存部门在指定系统的准入 + 菜单授权。 */
    @PutMapping("/departments/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "data-permission", action = "edit")
    public Result<SystemAuthorizationVO> saveDepartment(@PathVariable Long id,
                                                        @PathVariable String code,
                                                        @RequestBody SystemAuthorizationRequest request) {
        return Result.success("系統授權已更新", systemAuthorizationService.save(
                SystemAuthorizationService.TARGET_DEPARTMENT, id, code, request));
    }
}

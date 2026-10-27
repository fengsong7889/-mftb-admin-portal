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
 * 系统授权读写接口（权限中心重构 · 统一授权工作台的原子写底座）。
 * <p>路径以「目标 × 系统」为最小单位；同一目标在同一系统的准入 + 菜单授权一次事务保存，
 * 不影响其他系统的既有授权，与旧的 {@code /api/roles/{id}/permissions} 全量写接口分开。
 * <p>守卫菜单统一切到 {@code authorization-center}（授权中心），{@code anyOf} 保留旧 key
 * （function-permission / data-permission）作为过渡期兼容；旧菜单停用后存量授权已由
 * 迁移 {@code iam:authz-center-menu:v1.0} 合并到新 key，不会产生权限漂移。
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SystemAuthorizationController {

    private final SystemAuthorizationService systemAuthorizationService;
    private final SysSystemMapper sysSystemMapper;

    /**
     * 启用系统目录（授权工作台 Tab 数据源）。
     * <p>与 {@code /api/portal/context} 的区别：本接口不受当前用户系统准入限制，
     * 因为管理员需要能看到全部可配置系统。
     */
    @GetMapping("/systems")
    @RequirePermission(menu = "authorization-center", anyOf = {"function-permission", "data-permission"})
    public Result<List<PortalSystemVO>> catalog() {
        List<SysSystem> all = sysSystemMapper.selectList(
                new LambdaQueryWrapper<SysSystem>()
                        .eq(SysSystem::getStatus, 1)
                        .orderByAsc(SysSystem::getSort));
        return Result.success(all.stream().map(PortalSystemVO::from).toList());
    }

    /** 读取角色在指定系统的授权快照。 */
    @GetMapping("/roles/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "authorization-center", anyOf = {"function-permission"})
    public Result<SystemAuthorizationVO> readRole(@PathVariable Long id, @PathVariable String code) {
        return Result.success(systemAuthorizationService.read(
                SystemAuthorizationService.TARGET_ROLE, id, code));
    }

    /** 原子保存角色在指定系统的准入 + 菜单授权。 */
    @PutMapping("/roles/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "authorization-center", action = "edit", anyOf = {"function-permission"})
    public Result<SystemAuthorizationVO> saveRole(@PathVariable Long id,
                                                   @PathVariable String code,
                                                   @RequestBody SystemAuthorizationRequest request) {
        return Result.success("系統授權已更新", systemAuthorizationService.save(
                SystemAuthorizationService.TARGET_ROLE, id, code, request));
    }

    /** 角色全部启用系统的授权快照（工作台总览/角色复制预填）。 */
    @GetMapping("/roles/{id}/authorization-overview")
    @RequirePermission(menu = "authorization-center", anyOf = {"function-permission"})
    public Result<List<SystemAuthorizationVO>> roleOverview(@PathVariable Long id) {
        return Result.success(systemAuthorizationService.readAllSystems(
                SystemAuthorizationService.TARGET_ROLE, id));
    }

    /** 读取部门在指定系统的授权快照。 */
    @GetMapping("/departments/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "data-permission", anyOf = {"authorization-center"})
    public Result<SystemAuthorizationVO> readDepartment(@PathVariable Long id, @PathVariable String code) {
        return Result.success(systemAuthorizationService.read(
                SystemAuthorizationService.TARGET_DEPARTMENT, id, code));
    }

    /** 原子保存部门在指定系统的准入 + 菜单授权。 */
    @PutMapping("/departments/{id}/systems/{code}/authorization")
    @RequirePermission(menu = "data-permission", action = "edit", anyOf = {"authorization-center"})
    public Result<SystemAuthorizationVO> saveDepartment(@PathVariable Long id,
                                                        @PathVariable String code,
                                                        @RequestBody SystemAuthorizationRequest request) {
        return Result.success("系統授權已更新", systemAuthorizationService.save(
                SystemAuthorizationService.TARGET_DEPARTMENT, id, code, request));
    }

    /** 部门全部启用系统的授权快照（工作台总览）。 */
    @GetMapping("/departments/{id}/authorization-overview")
    @RequirePermission(menu = "data-permission", anyOf = {"authorization-center"})
    public Result<List<SystemAuthorizationVO>> deptOverview(@PathVariable Long id) {
        return Result.success(systemAuthorizationService.readAllSystems(
                SystemAuthorizationService.TARGET_DEPARTMENT, id));
    }
}

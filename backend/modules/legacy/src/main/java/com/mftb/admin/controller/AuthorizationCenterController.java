package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EmpPermissionTraceVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PermissionAuditVO;
import com.mftb.admin.service.AuthorizationTraceService;
import com.mftb.admin.service.PermissionAuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 授权中心扩展接口（权限中心重构）：员工权限透视 + 授权变更审计查询。
 * <p>原子读写接口（目标 × 系统的 read/save/overview）位于 {@link SystemAuthorizationController}；
 * 角色复制位于 {@link RoleController}（跟随角色资源路径）。本控制器只承载"读诊断"类能力。
 */
@RestController
@RequestMapping("/api/authorization")
@RequiredArgsConstructor
public class AuthorizationCenterController {

    /** 与全局 Jackson 时间序列化一致的时区 */
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private final AuthorizationTraceService authorizationTraceService;
    private final PermissionAuditService permissionAuditService;

    /** 员工权限透视：最终权限并集 + 每条授权的角色/部门来源。 */
    @GetMapping("/trace/{userId}")
    @RequirePermission(menu = "authorization-center", anyOf = {"function-permission"})
    public Result<EmpPermissionTraceVO> trace(@PathVariable Long userId) {
        return Result.success(authorizationTraceService.trace(userId));
    }

    /**
     * 授权变更审计分页查询（时间倒序）。
     *
     * @param start 起始时间（epoch 毫秒，可空）
     * @param end   截止时间（epoch 毫秒，可空）
     */
    @GetMapping("/audit")
    @RequirePermission(menu = "authorization-center", anyOf = {"function-permission"})
    public Result<PageResult<PermissionAuditVO>> audit(
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) Long targetId,
            @RequestParam(required = false) String changeType,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) Long start,
            @RequestParam(required = false) Long end,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long pageSize) {
        return Result.success(permissionAuditService.query(
                targetType, targetId, changeType, operator,
                toLocalDateTime(start), toLocalDateTime(end), page, pageSize));
    }

    /** 指定目标的最近审计记录（工作台"最近变更"面板）。 */
    @GetMapping("/audit/recent")
    @RequirePermission(menu = "authorization-center", anyOf = {"function-permission", "data-permission"})
    public Result<java.util.List<PermissionAuditVO>> recentAudit(
            @RequestParam String targetType,
            @RequestParam Long targetId,
            @RequestParam(defaultValue = "10") int limit) {
        return Result.success(permissionAuditService.recentOf(targetType, targetId, limit));
    }

    private LocalDateTime toLocalDateTime(Long epochMillis) {
        return epochMillis == null ? null
                : LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZONE);
    }
}

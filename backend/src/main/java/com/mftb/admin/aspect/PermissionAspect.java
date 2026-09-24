package com.mftb.admin.aspect;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 权限校验切面: 拦截 @RequirePermission 标注的接口方法
 * <p>
 * 当前登录员工由 JwtAuthenticationFilter 写入 Authentication.details
 * <p>
 * 统一门户 Round 3：先做「菜单动作」校验，再做「系统准入」校验。
 * 系统准入默认仅记录 warn（observe 模式），配置项 {@code system-portal.strict-mode=true} 后
 * 会真正拒绝跨系统调用；未归属菜单（{@code system_code=NULL}）与 portal 哨兵均跳过。
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class PermissionAspect {

    /** 个人工作台/公共入口哨兵，与非业务系统一并对准入判定跳过 */
    private static final String PORTAL_SENTINEL = "portal";

    private final PermissionService permissionService;

    /** 菜单反推系统总开关：false 时 Aspect 完全跳过系统准入判定（包括日志），
     *  作为统一门户 Round 6 引入的"一键回退"开关；默认 true，行为与 Round 5 一致。 */
    @Value("${system-portal.enabled:true}")
    private boolean systemPortalEnabled;

    /** 严格模式：true 时无系统准入 → 403；false（默认）时仅日志观察，避免误伤未迁移完的旧入口。 */
    @Value("${system-portal.strict-mode:false}")
    private boolean strictMode;

    @Around("@annotation(permission)")
    public Object check(ProceedingJoinPoint joinPoint, RequirePermission permission) throws Throwable {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object details = authentication == null ? null : authentication.getDetails();
        if (!(details instanceof SysUser user)) {
            log.warn("权限拦截: 未获取到登录员工信息, menu={}, action={}", permission.menu(), permission.action());
            throw new PermissionDeniedException(permission.menu(), permission.action());
        }
        // 1) 菜单动作校验：主菜单不通过时, 回退到 anyOf 备选菜单（OR 语义, 仍默认拒绝）
        String action = permission.action();
        String grantedMenu = null;
        if (permissionService.hasPermission(user, permission.menu(), action)) {
            grantedMenu = permission.menu();
        } else {
            for (String alt : permission.anyOf()) {
                if (permissionService.hasPermission(user, alt, action)) {
                    grantedMenu = alt;
                    break;
                }
            }
        }
        if (grantedMenu == null) {
            log.warn("权限拦截: 员工 [{}] 无权访问 menu={}, anyOf={}, action={}",
                    user.getUsername(), permission.menu(), java.util.Arrays.toString(permission.anyOf()), action);
            throw new PermissionDeniedException(permission.menu(), action);
        }
        // 2) 系统准入校验（Round 3；默认观察模式）——按实际授权的菜单反查归属系统
        checkSystemAccess(user, grantedMenu);
        return joinPoint.proceed();
    }

    /**
     * 通过 menuKey 反查归属系统，再判定当前员工是否具有该系统准入。
     * 未登记 / portal 哨兵 / 无 system_code 的菜单 → 跳过；
     * 严格模式关闭时只 warn，不改变响应。
     */
    private void checkSystemAccess(SysUser user, String menuKey) {
        if (!systemPortalEnabled) {
            // 一键回退：开关关闭时既不拒绝也不写日志，行为与旧版本完全一致
            return;
        }
        String systemCode = permissionService.resolveSystemCodeOfMenu(menuKey);
        if (!StringUtils.hasText(systemCode) || PORTAL_SENTINEL.equalsIgnoreCase(systemCode)) {
            return;
        }
        if (permissionService.hasSystemAccess(user, systemCode)) {
            return;
        }
        if (strictMode) {
            log.warn("系统准入拒绝: 员工 [{}] 无权访问 system={}, menu={}（strict-mode=true）",
                    user.getUsername(), systemCode, menuKey);
            // 复用 PermissionDeniedException 保持错误契约（HTTP 200 + code=403）
            throw new PermissionDeniedException(menuKey, "system:" + systemCode);
        }
        log.warn("系统准入观察: 员工 [{}] 缺少 system={} 准入但已放行（strict-mode=false）",
                user.getUsername(), systemCode);
    }
}

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
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * 权限校验切面: 拦截 @RequirePermission 标注的接口方法
 * <p>
 * 当前登录员工由 JwtAuthenticationFilter 写入 Authentication.details
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class PermissionAspect {

    private final PermissionService permissionService;

    @Around("@annotation(permission)")
    public Object check(ProceedingJoinPoint joinPoint, RequirePermission permission) throws Throwable {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object details = authentication == null ? null : authentication.getDetails();
        if (!(details instanceof SysUser user)) {
            log.warn("权限拦截: 未获取到登录员工信息, menu={}, action={}", permission.menu(), permission.action());
            throw new PermissionDeniedException(permission.menu(), permission.action());
        }
        if (!permissionService.hasPermission(user, permission.menu(), permission.action())) {
            log.warn("权限拦截: 员工 [{}] 无权访问 menu={}, action={}",
                    user.getUsername(), permission.menu(), permission.action());
            throw new PermissionDeniedException(permission.menu(), permission.action());
        }
        return joinPoint.proceed();
    }
}

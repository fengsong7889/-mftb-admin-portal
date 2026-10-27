package com.mftb.admin.aspect;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionService;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PermissionAspect 系统准入分支单测（Round 6 · enabled + strict-mode 双开关）。
 * <p>关注点：
 * <ul>
 *   <li>{@code system-portal.enabled=false} → Aspect 完全不访问 PermissionService 的系统相关方法，
 *       行为等价 Round 5 之前的旧版本；</li>
 *   <li>{@code enabled=true, strict-mode=false} → 缺系统准入时只 warn 放行，不影响业务；</li>
 *   <li>{@code enabled=true, strict-mode=true} → 缺系统准入时抛 {@link PermissionDeniedException}；</li>
 *   <li>菜单归属 portal 或 NULL → 跳过系统准入，避免个人工作台/未归属接口被误拒。</li>
 * </ul>
 */
class PermissionAspectSystemTest {

    private PermissionService permissionService;
    private PermissionAspect aspect;
    private ProceedingJoinPoint joinPoint;
    private RequirePermission annotation;
    private SysUser user;

    @BeforeEach
    void setUp() {
        permissionService = mock(PermissionService.class);
        aspect = new PermissionAspect(permissionService);
        joinPoint = mock(ProceedingJoinPoint.class);
        annotation = mock(RequirePermission.class);
        when(annotation.menu()).thenReturn("ad-sales");
        when(annotation.action()).thenReturn("view");

        user = new SysUser();
        user.setId(10L);
        user.setUsername("MF00001");
        user.setRole("guest");
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("MF00001", null, List.of());
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    @DisplayName("enabled=false：完全跳过系统准入判定，即使 hasSystemAccess 会返回 false 也放行")
    void disabledSkipsSystemCheckEntirely() throws Throwable {
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", false);
        ReflectionTestUtils.setField(aspect, "strictMode", true);
        when(permissionService.hasPermission(user, "ad-sales", "view")).thenReturn(true);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
        verify(permissionService, never()).resolveSystemCodeOfMenu(anyString());
        verify(permissionService, never()).hasSystemAccess(eq(user), anyString());
    }

    @Test
    @DisplayName("enabled=true + strict=false：缺系统准入只 warn，业务照常执行")
    void observeModeAllowsDespiteMissingSystemAccess() throws Throwable {
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", true);
        ReflectionTestUtils.setField(aspect, "strictMode", false);
        when(permissionService.hasPermission(user, "ad-sales", "view")).thenReturn(true);
        when(permissionService.resolveSystemCodeOfMenu("ad-sales")).thenReturn("ads");
        when(permissionService.hasSystemAccess(user, "ads")).thenReturn(false);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
    }

    @Test
    @DisplayName("enabled=true + strict=true：缺系统准入抛 PermissionDeniedException")
    void strictModeRejectsMissingSystemAccess() throws Throwable {
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", true);
        ReflectionTestUtils.setField(aspect, "strictMode", true);
        when(permissionService.hasPermission(user, "ad-sales", "view")).thenReturn(true);
        when(permissionService.resolveSystemCodeOfMenu("ad-sales")).thenReturn("ads");
        when(permissionService.hasSystemAccess(user, "ads")).thenReturn(false);

        assertThrows(PermissionDeniedException.class, () -> aspect.check(joinPoint, annotation));
    }

    @Test
    @DisplayName("menu 归属 portal：跳过系统准入，即使是 strict-mode 也不拒绝")
    void portalSentinelBypassesCheck() throws Throwable {
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", true);
        ReflectionTestUtils.setField(aspect, "strictMode", true);
        when(permissionService.hasPermission(user, "ad-sales", "view")).thenReturn(true);
        when(permissionService.resolveSystemCodeOfMenu("ad-sales")).thenReturn("portal");

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
        verify(permissionService, never()).hasSystemAccess(eq(user), anyString());
    }

    @Test
    @DisplayName("菜单未归属（resolve 返回 null）：跳过系统准入")
    void nullSystemCodeBypassesCheck() throws Throwable {
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", true);
        ReflectionTestUtils.setField(aspect, "strictMode", true);
        when(permissionService.hasPermission(user, "ad-sales", "view")).thenReturn(true);
        when(permissionService.resolveSystemCodeOfMenu("ad-sales")).thenReturn(null);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
        verify(permissionService, never()).hasSystemAccess(eq(user), anyString());
    }
}

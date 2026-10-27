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
 * PermissionAspect 的 {@code anyPermissions}（跨菜单 + 异动作 OR）单测。
 *
 * <p>这个属性是为需求入口收敛（rdm-intake → rdm-requirement 的 view_all/dispatch）准备的，
 * 失败模式两头都危险：写松了等于给未授权的人放跨菜单能力，写严了会把合法持有新锚点的人挡在 403。
 * 所以这里同时钉「放宽」与「不放宽」两侧：
 * <ol>
 *   <li>主菜单命中即放行，且不再去试任何备选（不多打无意义的权限查询）；</li>
 *   <li>anyOf 的同动作语义保持不变（回归保护）；</li>
 *   <li>anyPermissions 只在「该菜单 + 该动作」成对命中时放行，系统准入按实际命中的菜单反查；</li>
 *   <li>三层都不命中 → 拒绝；格式非法的条目 → 拒绝，绝不因写错而放宽。</li>
 * </ol>
 */
class PermissionAspectAnyPermissionTest {

    private static final String PRIMARY_MENU = "rdm-intake";
    private static final String NEW_MENU = "rdm-requirement";

    private PermissionService permissionService;
    private PermissionAspect aspect;
    private ProceedingJoinPoint joinPoint;
    private RequirePermission annotation;
    private SysUser user;

    @BeforeEach
    void setUp() throws Throwable {
        permissionService = mock(PermissionService.class);
        aspect = new PermissionAspect(permissionService);
        joinPoint = mock(ProceedingJoinPoint.class);
        when(joinPoint.proceed()).thenReturn("ok");
        annotation = mock(RequirePermission.class);
        when(annotation.menu()).thenReturn(PRIMARY_MENU);
        when(annotation.action()).thenReturn("view");
        when(annotation.anyOf()).thenReturn(new String[0]);
        when(annotation.anyPermissions()).thenReturn(new String[0]);
        // 关闭系统准入，让本组用例只考察「菜单动作」这一层（准入分支由 PermissionAspectSystemTest 覆盖）
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", false);

        user = new SysUser();
        user.setId(70L);
        user.setUsername("MF00070");
        user.setRole("guest");
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("MF00070", null, List.of());
        auth.setDetails(user);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    @DisplayName("主菜单命中即放行，不再去试备选")
    void primaryHitShortCircuits() throws Throwable {
        when(annotation.anyPermissions()).thenReturn(new String[]{NEW_MENU + ":view_all"});
        when(permissionService.hasPermission(user, PRIMARY_MENU, "view")).thenReturn(true);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
        verify(permissionService, never()).hasPermission(eq(user), eq(NEW_MENU), anyString());
    }

    @Test
    @DisplayName("anyOf 同动作换菜单的旧语义不变")
    void anyOfStillMatchesSameAction() throws Throwable {
        when(annotation.anyOf()).thenReturn(new String[]{NEW_MENU});
        when(permissionService.hasPermission(user, NEW_MENU, "view")).thenReturn(true);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
    }

    @Test
    @DisplayName("anyPermissions 成对命中才放行（菜单换了、动作也换了）")
    void anyPermissionsMatchesPairedGrant() throws Throwable {
        when(annotation.anyPermissions()).thenReturn(new String[]{NEW_MENU + ":view_all"});
        when(permissionService.hasPermission(user, NEW_MENU, "view_all")).thenReturn(true);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
    }

    @Test
    @DisplayName("只持有同菜单的不同动作不能蒙过 anyPermissions")
    void wrongActionOnSameMenuDoesNotPass() throws Throwable {
        when(annotation.anyPermissions()).thenReturn(new String[]{NEW_MENU + ":view_all"});
        // 台账 view 是人人可看的宽权限，绝不能被当成全量可见
        when(permissionService.hasPermission(user, NEW_MENU, "view")).thenReturn(true);

        assertThrows(PermissionDeniedException.class, () -> aspect.check(joinPoint, annotation));
    }

    @Test
    @DisplayName("三层都不命中 → 默认拒绝")
    void deniesWhenNothingMatches() {
        when(annotation.anyOf()).thenReturn(new String[]{NEW_MENU});
        when(annotation.anyPermissions()).thenReturn(new String[]{NEW_MENU + ":dispatch"});

        assertThrows(PermissionDeniedException.class, () -> aspect.check(joinPoint, annotation));
    }

    /**
     * 写错注解必须 fail-closed：格式非法的条目按不命中处理。
     * <p>反过来（当成通配或直接抛 500）都不可接受：前者会把未校验的跨菜单能力放出去，
     * 后者把一个配置问题变成线上异常。
     * <p>故意不用「所有查询都返回 true」的宽 stub：那样会被主菜单命中而放行，测不到本意；
     * 这里只把非法拆分可能得到的菜单/动作置为已授权，证明切面根本不会拿它们去查权限。
     */
    @Test
    @DisplayName("格式非法的 anyPermissions 条目按拒绝处理")
    void malformedEntriesFailClosed() {
        when(annotation.anyPermissions()).thenReturn(new String[]{
                NEW_MENU,                    // 缺冒号
                NEW_MENU + ":",              // 动作为空
                ":view_all",                 // 菜单为空
        });
        when(permissionService.hasPermission(user, NEW_MENU, "")).thenReturn(true);
        when(permissionService.hasPermission(user, "", "view_all")).thenReturn(true);
        when(permissionService.hasPermission(user, NEW_MENU, "view")).thenReturn(true);

        assertThrows(PermissionDeniedException.class, () -> aspect.check(joinPoint, annotation));
        // 空菜单或空动作不得被拿去查权限（一旦查了就是拿脏配置当合法能力）
        verify(permissionService, never()).hasPermission(eq(user), anyString(), eq(""));
        verify(permissionService, never()).hasPermission(eq(user), eq(""), anyString());
    }

    @Test
    @DisplayName("anyPermissions 为空时与改动前完全一致（回归保护）")
    void emptyAnyPermissionsKeepsLegacyBehaviour() throws Throwable {
        when(annotation.anyOf()).thenReturn(new String[]{NEW_MENU});
        when(permissionService.hasPermission(user, PRIMARY_MENU, "view")).thenReturn(false);
        when(permissionService.hasPermission(user, NEW_MENU, "view")).thenReturn(true);

        assertDoesNotThrow(() -> aspect.check(joinPoint, annotation));
    }

    /**
     * 备选命中时，系统准入必须按**实际命中的菜单**反查归属，不能拿主菜单（已退役的锚点）去查。
     * <p>Round 3 的这条口径在换成异动作 OR 后依然成立，否则退役菜单会让准入判定落到空系统上。
     */
    @Test
    @DisplayName("备选命中时系统准入按命中菜单反查")
    void systemAccessUsesGrantedMenu() throws Throwable {
        ReflectionTestUtils.setField(aspect, "systemPortalEnabled", true);
        ReflectionTestUtils.setField(aspect, "strictMode", true);
        when(annotation.anyPermissions()).thenReturn(new String[]{NEW_MENU + ":view_all"});
        when(permissionService.hasPermission(user, NEW_MENU, "view_all")).thenReturn(true);
        when(permissionService.resolveSystemCodeOfMenu(NEW_MENU)).thenReturn("rdm");
        when(permissionService.hasSystemAccess(user, "rdm")).thenReturn(false);

        // 新菜单缺系统准入 → 严格模式拒绝；同时证明没有拿已退役的主菜单去反查
        assertThrows(PermissionDeniedException.class, () -> aspect.check(joinPoint, annotation));
        verify(permissionService).resolveSystemCodeOfMenu(NEW_MENU);
        verify(permissionService, never()).resolveSystemCodeOfMenu(PRIMARY_MENU);
    }
}

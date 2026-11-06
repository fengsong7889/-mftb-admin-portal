package com.mftb.admin.service;

import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 会议域授权拒绝的错误码语义测试。
 *
 * <p>钉住的事实：「用户没被授权」必须是 403，不能与「服务端出错」共用 code 500。
 * 2026-11-06 E2E 用低权限账号直调 6 个接口，实测 5 条越权拒绝都返回 {@code HTTP 200 + code 500}，
 * 于是监控告警把权限拒绝当服务端异常统计、前端无法按 code 做精细化分支、审计侧也分不清
 * 是攻击尝试还是故障。
 *
 * <p><b>同时钉住一条"不许改"的边界</b>：纪要读取对「不存在」与「无权」故意共用同一句话
 * （minutesId 是自增的，给不同文案等于提供 id 枚举口子）。那是补偿控制，不是本测试要统一的对象——
 * 这里只覆盖**本来就已经明确说出「无权」**的判定，把它们从 500 提到 403 不增加任何披露面。
 */
class MeetingAccessGuardErrorCodeTest {

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private MeetingAttendeeMapper attendeeMapper;
    private MeetingAccessGuard guard;

    private static SysUser user(long id) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF" + id);
        u.setName("員工" + id);
        u.setStatus(1);
        u.setRole("user");
        return u;
    }

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        attendeeMapper = mock(MeetingAttendeeMapper.class);
        guard = new MeetingAccessGuard(operatorResolver, permissionService, attendeeMapper,
                mock(SysUserMapper.class));
    }

    /** 全部按「非行政、非组织者、非参会人」的最严配置打桩 */
    private void denyEverything() {
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(false);
        when(attendeeMapper.countAttendee(anyLong(), anyLong())).thenReturn(0);
        when(attendeeMapper.selectList(any())).thenReturn(List.of());
    }

    private static MeetingBooking bookingOf(long organizerId) {
        MeetingBooking b = new MeetingBooking();
        b.setId(50L);
        b.setOrganizerId(organizerId);
        return b;
    }

    @Test
    @DisplayName("会议室档案维护权缺失 → 403 语义的 PermissionDeniedException")
    void roomManageDeniedIsPermissionDenied() {
        denyEverything();
        PermissionDeniedException ex = assertThrows(PermissionDeniedException.class,
                () -> guard.requireRoomManage(user(1L)));
        assertTrue(ex.getMessage().contains("無權維護會議室檔案"), ex.getMessage());
    }

    @Test
    @DisplayName("规则/黑名单维护权缺失 → 403")
    void recordManagerDeniedIsPermissionDenied() {
        denyEverything();
        assertThrows(PermissionDeniedException.class,
                () -> guard.requireRecordManager(user(1L)));
    }

    @Test
    @DisplayName("非行政视野请求全量台账 → 403")
    void seeAllDeniedIsPermissionDenied() {
        assertThrows(PermissionDeniedException.class, () -> guard.requireSeeAll(false));
    }

    @Test
    @DisplayName("读别人的会议 → 403（三重判定之外一律拒绝，防 IDOR）")
    void otherBookingReadIsPermissionDenied() {
        denyEverything();
        PermissionDeniedException ex = assertThrows(PermissionDeniedException.class,
                () -> guard.requireBookingReadable(bookingOf(999L), user(1L)));
        assertEquals("無權查看該會議", ex.getMessage());
    }

    @Test
    @DisplayName("改别人的会议 → 403")
    void otherBookingWriteIsPermissionDenied() {
        denyEverything();
        assertThrows(PermissionDeniedException.class,
                () -> guard.requireBookingWritable(bookingOf(999L), user(1L)));
    }

    @Test
    @DisplayName("替他人表态 → 403")
    void actForOthersIsPermissionDenied() {
        denyEverything();
        assertThrows(PermissionDeniedException.class,
                () -> guard.requireSelfOrAdmin(999L, user(1L)));
    }

    @Test
    @DisplayName("403 与 401 各自归位：GlobalExceptionHandler 按异常类型给码，不再一色 500")
    void codesMatchSemantics() {
        // 权限拒绝走 PermissionDeniedException → FORBIDDEN(403)
        assertEquals(ResultCode.FORBIDDEN.getCode(), 403);
        denyEverything();
        assertThrows(PermissionDeniedException.class, () -> guard.requireSeeAll(false));
        // 登录态失效走 401：这句话本身就是「请重新登录」，给 500 时前端只弹 toast 不跳登录页，
        // 用户会停在一片拿不到数据的界面上反复重试
        when(operatorResolver.currentUser()).thenReturn(null);
        com.mftb.admin.common.BusinessException ex = assertThrows(
                com.mftb.admin.common.BusinessException.class, () -> guard.currentUser());
        assertEquals(ResultCode.UNAUTHORIZED.getCode(), ex.getCode());
    }

    @Test
    @DisplayName("组织者与行政的正常路径不被误伤：有权限时不得抛异常")
    void allowedPathsDoNotThrow() {
        when(operatorResolver.isAdmin(any())).thenReturn(true);
        SysUser admin = user(1L);
        guard.requireRoomManage(admin);
        guard.requireRecordManager(admin);
        guard.requireSeeAll(true);
        guard.requireBookingReadable(bookingOf(1L), admin);
        guard.requireBookingWritable(bookingOf(1L), admin);
        guard.requireSelfOrAdmin(1L, admin);
    }
}

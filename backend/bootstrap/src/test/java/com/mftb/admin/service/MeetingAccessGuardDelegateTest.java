package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 行政代订资格判定的单测。
 *
 * <p>这里守的是"权限锚点"本身：代订能把会议室挂到别人名下、能给别人塞一条日程，
 * 属于行政权力。一旦这个判定漏了口子，被黑名单限制的人只要找人代订就能继续占用窗口，
 * 所以"非行政必须被拒"和"实际使用人自己也要过黑名单"是同一条安全线的两端。
 */
class MeetingAccessGuardDelegateTest {

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private SysUserMapper userMapper;
    private MeetingAccessGuard guard;

    private static SysUser user(long id, int status) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF" + id);
        u.setName("員工" + id);
        u.setStatus(status);
        u.setRole("user");
        return u;
    }

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        userMapper = mock(SysUserMapper.class);
        guard = new MeetingAccessGuard(operatorResolver, permissionService,
                mock(MeetingAttendeeMapper.class), userMapper);
    }

    @Test
    @DisplayName("没有代订意图时不做任何查询与权限判定")
    void nullDelegateIsNoOp() {
        SysUser operator = user(1L, 1);
        assertNull(guard.resolveDelegateFor(null, operator));
        assertNull(guard.resolveDelegateFor(0L, operator));
        verify(userMapper, never()).selectById(anyLong());
        verify(permissionService, never()).hasPermission(any(), any(), any());
    }

    @Test
    @DisplayName("传了组织者自己等价于自订：归零而不是留下自代自的脏数据")
    void delegatingToSelfIsNormalizedAway() {
        SysUser operator = user(1L, 1);
        assertNull(guard.resolveDelegateFor(1L, operator));
        verify(userMapper, never()).selectById(anyLong());
    }

    @Test
    @DisplayName("非行政一律拒绝，且不去查人（不泄露工号是否存在）")
    void nonAdminCannotDelegate() {
        SysUser operator = user(1L, 1);
        when(operatorResolver.isAdmin(operator)).thenReturn(false);
        when(permissionService.hasPermission(operator, MeetingConstants.MENU_RECORD, MeetingConstants.ACTION_EDIT))
                .thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.resolveDelegateFor(9L, operator));
        assertTrue(ex.getMessage().contains("僅行政"), ex.getMessage());
        verify(userMapper, never()).selectById(9L);
    }

    @Test
    @DisplayName("实际使用人必须真实存在且在职")
    void delegateMustExistAndBeActive() {
        SysUser operator = user(1L, 1);
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(true);
        when(userMapper.selectById(9L)).thenReturn(null);
        assertTrue(assertThrows(BusinessException.class, () -> guard.resolveDelegateFor(9L, operator))
                .getMessage().contains("不存在"));

        when(userMapper.selectById(9L)).thenReturn(user(9L, 0));
        assertTrue(assertThrows(BusinessException.class, () -> guard.resolveDelegateFor(9L, operator))
                .getMessage().contains("離職"));
    }

    @Test
    @DisplayName("行政 + 在职人员 → 返回该使用人")
    void adminCanDelegateToActiveUser() {
        SysUser operator = user(1L, 1);
        SysUser target = user(9L, 1);
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(true);
        when(userMapper.selectById(9L)).thenReturn(target);
        assertEquals(target, guard.resolveDelegateFor(9L, operator));
    }
}

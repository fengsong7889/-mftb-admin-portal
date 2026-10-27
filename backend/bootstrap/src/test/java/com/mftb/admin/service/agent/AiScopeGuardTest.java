package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 共用配置写权限：只拦 common/global，系统级配置交给页面 edit 权限。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiScopeGuardTest {

    @Mock private OperatorResolver operatorResolver;
    @Mock private SysRoleMapper sysRoleMapper;

    private AiScopeGuard guard;

    @BeforeEach
    void setUp() {
        guard = new AiScopeGuard(operatorResolver, sysRoleMapper);
    }

    @Test
    @DisplayName("系统级作用域直接放行，不查登录人")
    void systemScopeAlwaysAllowed() {
        assertDoesNotThrow(() -> guard.assertWritable("rdm"));
    }

    @Test
    @DisplayName("共用作用域：管理员（role=admin）可写")
    void adminRoleCanWriteCommon() {
        SysUser admin = new SysUser();
        admin.setRole("admin");
        when(operatorResolver.currentUser()).thenReturn(admin);

        assertDoesNotThrow(() -> guard.assertWritable("common"));
        assertDoesNotThrow(() -> guard.assertWritable(null));
    }

    @Test
    @DisplayName("共用作用域：functionRoles 绑定 admin 角色同样放行")
    void boundAdminRoleCanWriteCommon() {
        SysUser user = new SysUser();
        user.setRole("guest");
        user.setFunctionRoles("[3]");
        SysRole role = new SysRole();
        role.setId(3L);
        role.setCode("admin");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(sysRoleMapper.selectList(any())).thenReturn(List.of(role));

        assertDoesNotThrow(() -> guard.assertWritable("global"));
    }

    @Test
    @DisplayName("共用作用域：普通角色被拒绝")
    void normalUserCannotWriteCommon() {
        SysUser user = new SysUser();
        user.setRole("guest");
        user.setFunctionRoles("[7]");
        SysRole role = new SysRole();
        role.setId(7L);
        role.setCode("rdm_pm");
        when(operatorResolver.currentUser()).thenReturn(user);
        when(sysRoleMapper.selectList(any())).thenReturn(List.of(role));

        assertThrows(BusinessException.class, () -> guard.assertWritable("common"));
        assertThrows(BusinessException.class, () -> guard.assertWritable(null));
        assertThrows(BusinessException.class, () -> guard.assertWritable("default"));
    }

    @Test
    @DisplayName("无登录上下文（定时任务/单测）放行，避免误伤后台任务")
    void noUserAllowed() {
        when(operatorResolver.currentUser()).thenReturn(null);
        assertDoesNotThrow(() -> guard.assertWritable("common"));
    }
}

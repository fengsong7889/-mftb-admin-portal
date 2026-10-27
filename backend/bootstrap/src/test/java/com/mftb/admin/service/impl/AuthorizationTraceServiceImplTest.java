package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EmpPermissionTraceVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 员工权限透视单测：超管直通、员工不存在报错、普通用户走并集查询路径。
 * <p>并集合并的完整数据形态依赖启动后端到端验证（透视页 vs 真实侧边栏），
 * 此处锁定关键分支行为。
 */
class AuthorizationTraceServiceImplTest {

    private JdbcTemplate jdbc;
    private SysUserMapper userMapper;
    private AuthorizationTraceServiceImpl service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        userMapper = mock(SysUserMapper.class);
        service = new AuthorizationTraceServiceImpl(jdbc, userMapper);
    }

    @Test
    @DisplayName("员工不存在 → 抛业务异常")
    void rejectsUnknownUser() {
        when(userMapper.selectById(99L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> service.trace(99L));
    }

    @Test
    @DisplayName("sys_user.role=admin → superAdmin 直通，不查明细")
    void builtinAdminBypassesDetail() {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername("root");
        user.setName("超级管理员");
        user.setRole("admin");
        when(userMapper.selectById(1L)).thenReturn(user);

        EmpPermissionTraceVO vo = service.trace(1L);

        assertTrue(vo.getSuperAdmin());
        assertEquals(List.of(), vo.getMenus());
        assertEquals(List.of(), vo.getSystems());
        verify(jdbc, never()).query(any(String.class), any(RowMapper.class));
    }

    @Test
    @DisplayName("绑定启用 admin 角色 → 判定为超管")
    void adminRoleGrantsSuperAdmin() {
        SysUser user = new SysUser();
        user.setId(2L);
        user.setUsername("u2");
        user.setRole("user");
        user.setFunctionRoles("[3]");
        when(userMapper.selectById(2L)).thenReturn(user);

        EmpPermissionTraceVO.TraceRole adminRole = new EmpPermissionTraceVO.TraceRole();
        adminRole.setId(3L);
        adminRole.setName("系统管理员");
        adminRole.setCode("admin");
        adminRole.setStatus(1);
        when(jdbc.query(contains("FROM sys_role WHERE id IN"), any(RowMapper.class)))
                .thenReturn(List.of(adminRole));

        EmpPermissionTraceVO vo = service.trace(2L);

        assertTrue(vo.getSuperAdmin());
        assertEquals(1, vo.getRoles().size());
    }

    @Test
    @DisplayName("普通用户 → 非超管，进入角色/部门并集查询路径")
    void normalUserGoesThroughMergePath() {
        SysUser user = new SysUser();
        user.setId(4L);
        user.setUsername("u4");
        user.setRole("user");
        user.setFunctionRoles("[5]");
        user.setDepartmentId(9L);
        when(userMapper.selectById(4L)).thenReturn(user);
        when(jdbc.query(contains("FROM sys_role WHERE id IN"), any(RowMapper.class)))
                .thenReturn(List.of());

        EmpPermissionTraceVO vo = service.trace(4L);

        assertFalse(vo.getSuperAdmin());
        // 角色通道与部门通道各查一次菜单 + 一次系统准入（RowCallbackHandler 变体）
        verify(jdbc).query(contains("FROM sys_role_menu rm"), any(RowCallbackHandler.class));
        verify(jdbc).query(contains("FROM sys_department_menu dm"), any(RowCallbackHandler.class), any(Object[].class));
        verify(jdbc).query(contains("FROM sys_role_system rs"), any(RowCallbackHandler.class));
        verify(jdbc).query(contains("FROM sys_department_system ds"), any(RowCallbackHandler.class), any(Object[].class));
    }
}

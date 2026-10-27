package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 员工服务层的「授权动作」门槛测试（方案 §7.3：人事编辑不能隐式获得角色授予能力）。
 * <p>
 * 控制器注解只挡住走 HTTP 的调用，服务层这一道是给内部调用与未来新入口兜底的：
 * 断言的是「没 authorize 时角色字段根本不会被写库」，而不是「方法被调用过」。
 */
class EmployeeRoleAuthorizeTest {

    private static final long TARGET_ID = 24L;
    private static final long ADMIN_ROLE_ID = 1L;
    private static final long NORMAL_ROLE_ID = 7L;

    private SysUserMapper sysUserMapper;
    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private JdbcTemplate jdbcTemplate;
    private EmployeeServiceImpl service;

    private final SysUser operator = user(1L, "MF00001", "HR專員");
    private final SysUser target = user(TARGET_ID, "MF00024", "張三");

    @BeforeEach
    void setUp() {
        for (Class<?> entity : List.of(SysUser.class, com.mftb.admin.entity.SysLoginLog.class,
                com.mftb.admin.entity.EmpPositionRecord.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
        sysUserMapper = mock(SysUserMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new EmployeeServiceImpl(sysUserMapper, mock(SysDepartmentMapper.class),
                mock(SysPositionMapper.class), mock(SysLoginLogMapper.class),
                mock(EmpPositionRecordMapper.class), mock(com.mftb.admin.service.HrAssignmentQuery.class), mock(com.mftb.admin.service.HrMasterDataResolver.class), mock(com.mftb.admin.service.HrEmploymentPeriodService.class), mock(com.mftb.admin.service.HrAuditService.class), mock(PasswordEncoder.class), jdbcTemplate,
                operatorResolver, permissionService, mock(BizSeqService.class));

        lenient().when(operatorResolver.currentUser()).thenReturn(operator);
        lenient().when(operatorResolver.currentOperatorName()).thenReturn("HR專員");
        lenient().when(sysUserMapper.selectById(TARGET_ID)).thenReturn(target);
        // 内置超管角色的 id：与 lookupRoleIdByCode('admin') 的 SQL 结果对应
        lenient().when(jdbcTemplate.queryForList(
                        org.mockito.ArgumentMatchers.contains("SELECT id FROM sys_role WHERE code = ?"),
                        eq(Long.class), eq("admin")))
                .thenReturn(List.of(ADMIN_ROLE_ID));
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setUsername(empId);
        u.setName(name);
        u.setRole("user");
        u.setStatus(1);
        u.setFunctionRoles(JsonUtils.toJson(List.of(NORMAL_ROLE_ID)));
        return u;
    }

    private void grantAuthorize(boolean granted) {
        when(permissionService.hasPermission(operator, EmployeeConstants.MENU_EMPLOYEE,
                EmployeeConstants.ACTION_AUTHORIZE)).thenReturn(granted);
    }

    private EmployeeRequest requestWithRoles(List<Long> roleIds) {
        EmployeeRequest request = new EmployeeRequest();
        request.setName("張三");
        request.setFunctionRoleIds(roleIds);
        return request;
    }

    @Test
    @DisplayName("没有 authorize 时提交功能角色：直接拒绝，不写库")
    void updateWithoutAuthorizeRejectsRoleChange() {
        grantAuthorize(false);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.update(TARGET_ID, requestWithRoles(List.of(NORMAL_ROLE_ID))));
        assertTrue(ex.getMessage().contains("角色與菜單授權"), "拒绝文案要指向缺失的动作: " + ex.getMessage());
        verify(sysUserMapper, never()).updateById(any(SysUser.class));
    }

    @Test
    @DisplayName("有 authorize 时角色才落库")
    void updateWithAuthorizeWritesRoles() {
        grantAuthorize(true);

        EmployeeVO vo = service.update(TARGET_ID, requestWithRoles(List.of(NORMAL_ROLE_ID)));

        assertEquals(List.of(NORMAL_ROLE_ID), vo.getFunctionRoleIds());
        verify(sysUserMapper).updateById(target);
        verify(permissionService).evictAll();
    }

    @Test
    @DisplayName("不带角色字段的人事编辑不触发授权校验：编辑姓名部门不该被 authorize 挡住")
    void plainProfileEditDoesNotRequireAuthorize() {
        grantAuthorize(false);

        service.update(TARGET_ID, requestWithRoles(null));

        verify(permissionService, never()).hasPermission(operator, EmployeeConstants.MENU_EMPLOYEE,
                EmployeeConstants.ACTION_AUTHORIZE);
        verify(sysUserMapper).updateById(target);
    }

    @Test
    @DisplayName("拿不到当前登录人时拒绝授权（fail-closed，不得因看不清是谁而放行）")
    void unknownOperatorCannotAuthorize() {
        grantAuthorize(false);
        when(operatorResolver.currentUser()).thenReturn(null);

        assertThrows(BusinessException.class,
                () -> service.update(TARGET_ID, requestWithRoles(List.of(NORMAL_ROLE_ID))));
    }

    @Test
    @DisplayName("独立授权端点仍禁止绑定内置超管角色")
    void bindRolesStillRejectsSuperAdminBinding() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.bindRoles(TARGET_ID, List.of(ADMIN_ROLE_ID)));
        assertTrue(ex.getMessage().contains("超級管理員"), "应沿用既有防提权文案: " + ex.getMessage());
        verify(sysUserMapper, never()).updateById(any(SysUser.class));
    }

    @Test
    @DisplayName("内置系统账号不是员工档案，不允许通过授权端点改角色")
    void bindRolesRejectsSystemAccount() {
        SysUser builtin = user(2L, com.mftb.admin.constant.BuiltinAccounts.ADMIN_USERNAME, "系統管理員");
        builtin.setRole("admin");
        when(sysUserMapper.selectById(2L)).thenReturn(builtin);

        assertThrows(BusinessException.class, () -> service.bindRoles(2L, List.of(NORMAL_ROLE_ID)));
    }
}

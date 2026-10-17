package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.entity.SysBizSeqRule;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 内置系统管理员账号在「员工档案」入口的守卫测试。
 * <p>
 * 钉住两类权限提升路径：
 * <ol>
 *   <li><b>经员工管理接管超管</b>：{@code employee-management:edit} 若能重置系统账号密码，
 *       等于「有员工编辑权就能重置超管密码并登录接管全系统」；停用/删除同理会直接把超管入口拆掉。</li>
 *   <li><b>经 role 字段自我提权</b>：{@code sys_user.role='admin'} 是超管硬直通标记，
 *       若新增/编辑接受前端传入的 role，有员工编辑权的人就能把自己提成超管。
 *       员工权限只能走 function_roles（且已禁止绑超管角色）与部门授权。</li>
 * </ol>
 */
class BuiltinAdminAccountGuardTest {

    private static final long ADMIN_ID = 900L;
    private static final long EMPLOYEE_ID = 7L;

    private SysUserMapper sysUserMapper;
    private JdbcTemplate jdbcTemplate;
    private PermissionService permissionService;
    private EmployeeServiceImpl service;

    @BeforeEach
    void setUp() {
        sysUserMapper = mock(SysUserMapper.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        permissionService = mock(PermissionService.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        when(passwordEncoder.encode(anyString())).thenReturn("$2a$10$" + "x".repeat(53));
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("管理員");
        BizSeqService bizSeqService = mock(BizSeqService.class);
        SysBizSeqRule rule = new SysBizSeqRule();
        rule.setPrefix("MF");
        rule.setSeqLength(5);
        when(bizSeqService.getRule(BizSeqService.RULE_EMPLOYEE_NO)).thenReturn(rule);
        service = new EmployeeServiceImpl(sysUserMapper, mock(SysDepartmentMapper.class),
                mock(SysPositionMapper.class), mock(SysLoginLogMapper.class), mock(EmpPositionRecordMapper.class),
                passwordEncoder, jdbcTemplate, operatorResolver, permissionService, bizSeqService);
    }

    private SysUser systemAccount() {
        SysUser u = new SysUser();
        u.setId(ADMIN_ID);
        u.setUsername(BuiltinAccounts.ADMIN_USERNAME);
        u.setName(BuiltinAccounts.ADMIN_DISPLAY_NAME);
        u.setRole("admin");
        u.setStatus(1);
        return u;
    }

    private SysUser employee() {
        SysUser u = new SysUser();
        u.setId(EMPLOYEE_ID);
        u.setUsername("MF00007");
        u.setEmpId("MF00007");
        u.setName("李四");
        u.setRole("guest");
        u.setStatus(1);
        return u;
    }

    @Test
    @DisplayName("重置系统账号密码被拒：否则有员工编辑权即可接管超管")
    void rejectsResettingSystemAccountPassword() {
        when(sysUserMapper.selectById(ADMIN_ID)).thenReturn(systemAccount());

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.resetPassword(ADMIN_ID, "Init88#ab"));

        assertTrue(e.getMessage().contains("內置系統管理員賬號"), e.getMessage());
        verify(sysUserMapper, never()).update(any(), any());
        verify(sysUserMapper, never()).updateById(any(SysUser.class));
    }

    @Test
    @DisplayName("停用/删除/编辑系统账号一律被拒")
    void rejectsDisablingDeletingAndEditingSystemAccount() {
        when(sysUserMapper.selectById(ADMIN_ID)).thenReturn(systemAccount());

        assertThrows(BusinessException.class, () -> service.updateStatus(ADMIN_ID, 0));
        assertThrows(BusinessException.class, () -> service.delete(ADMIN_ID));
        assertThrows(BusinessException.class, () -> service.update(ADMIN_ID, request("系統管理員", null)));

        verify(sysUserMapper, never()).updateById(any(SysUser.class));
        verify(sysUserMapper, never()).deleteById(ADMIN_ID);
    }

    @Test
    @DisplayName("普通员工仍可正常停用（保护范围只限系统账号，MF00001 降级后不再享有内置保护）")
    void stillAllowsManagingNormalEmployees() {
        when(sysUserMapper.selectById(EMPLOYEE_ID)).thenReturn(employee());

        service.updateStatus(EMPLOYEE_ID, 0);

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserMapper).updateById(captor.capture());
        assertEquals(0, captor.getValue().getStatus());
    }

    @Test
    @DisplayName("新增员工：前端传 role=admin 被忽略，落库固定为普通账号")
    void createIgnoresRoleFromRequest() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(7);
        when(jdbcTemplate.queryForList(anyString(), eq(Long.class), any())).thenReturn(List.of());

        EmployeeRequest request = request("王五", "admin");
        request.setPassword("Init88#ab");
        service.create(request);

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserMapper).insert(captor.capture());
        assertEquals("guest", captor.getValue().getRole(),
                "接受前端 role 等于「有 employee-management:create 就能直接造一个超管」");
    }

    @Test
    @DisplayName("编辑员工：前端传 role=admin 不回写，既有角色值保持不变")
    void updateIgnoresRoleFromRequest() {
        when(sysUserMapper.selectById(EMPLOYEE_ID)).thenReturn(employee());

        service.update(EMPLOYEE_ID, request("李四", "admin"));

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserMapper).updateById(captor.capture());
        assertEquals("guest", captor.getValue().getRole(),
                "回写前端 role 等于「有 employee-management:edit 就能把自己提成超管」");
        // 权限相关字段变更必须失效缓存（含全局 revision 递增，多副本实例下次读自动重载）
        verify(permissionService).evictAll();
    }

    /** name/departmentId 保持不变，避免触发登录日志快照同步分支，让断言聚焦在 role 上 */
    private EmployeeRequest request(String name, String role) {
        EmployeeRequest request = new EmployeeRequest();
        request.setName(name);
        request.setRole(role);
        return request;
    }
}

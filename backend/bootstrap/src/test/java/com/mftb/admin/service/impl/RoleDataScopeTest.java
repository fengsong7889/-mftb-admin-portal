package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.OrgDataScope;
import com.mftb.admin.dto.RoleRequest;
import com.mftb.admin.dto.RoleVO;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysRoleDept;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysRoleDeptMapper;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysRoleMenuMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.service.PermissionAuditService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 角色「数据范围」持久化与校验测试。
 * <p>
 * 关注三件最容易做错的事：① 未提供档位时不得被放大（缺省=仅本人，且编辑时 null 表示「不改」）；
 * ② 非自定部门档位必须清空 {@code sys_role_dept} 残留行，否则下次改回自定部门会静默复活旧范围；
 * ③ 前端传来的部门 id 不可信，必须逐个验存在。
 */
class RoleDataScopeTest {

    private SysRoleMapper sysRoleMapper;
    private SysRoleDeptMapper sysRoleDeptMapper;
    private SysDepartmentMapper sysDepartmentMapper;
    private OrgScopeService orgScopeService;
    private PermissionAuditService auditService;
    private RoleServiceImpl service;

    @BeforeEach
    void setUp() {
        for (Class<?> entity : List.of(SysRole.class, SysRoleDept.class, SysDepartment.class, SysUser.class,
                com.mftb.admin.entity.SysRoleMenu.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
        sysRoleMapper = mock(SysRoleMapper.class);
        sysRoleDeptMapper = mock(SysRoleDeptMapper.class);
        sysDepartmentMapper = mock(SysDepartmentMapper.class);
        orgScopeService = mock(OrgScopeService.class);
        auditService = mock(PermissionAuditService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("HR管理員");
        service = new RoleServiceImpl(sysRoleMapper, mock(SysRoleMenuMapper.class), sysRoleDeptMapper,
                sysDepartmentMapper, mock(SysUserMapper.class), operatorResolver, mock(JdbcTemplate.class),
                mock(PermissionService.class), auditService, orgScopeService);
        when(sysRoleMapper.insert(any(SysRole.class))).thenAnswer(inv -> {
            SysRole r = inv.getArgument(0);
            r.setId(9L);
            return 1;
        });
    }

    private static SysRole role(long id, Integer dataScope) {
        SysRole r = new SysRole();
        r.setId(id);
        r.setName("角色" + id);
        r.setCode("role_" + id);
        r.setStatus(1);
        r.setDataScope(dataScope);
        return r;
    }

    private static RoleRequest request(Integer dataScope, List<Long> deptIds) {
        RoleRequest req = new RoleRequest();
        req.setName("門店考勤主管");
        req.setDataScope(dataScope);
        req.setDeptIds(deptIds);
        return req;
    }

    /** 部门存在性：selectCount 返回「查到的行数」，与服务层比对入参条数 */
    private void deptsExist(long count) {
        when(sysDepartmentMapper.selectCount(any())).thenReturn(count);
    }

    private void currentRoleIs(SysRole role) {
        when(sysRoleMapper.selectById(9L)).thenReturn(role);
    }

    /* ==================== 新增 ==================== */

    @Test
    @DisplayName("新建角色未提供档位时落库为仅本人，不得默认全部")
    void createWithoutScopeFallsBackToSelf() {
        RoleVO vo = service.create(request(null, null));

        assertEquals(OrgDataScope.SELF, vo.getDataScope());
        ArgumentCaptor<SysRole> captor = ArgumentCaptor.forClass(SysRole.class);
        verify(sysRoleMapper).insert(captor.capture());
        assertEquals(OrgDataScope.SELF, captor.getValue().getDataScope());
    }

    @Test
    @DisplayName("自定部门未勾选任何部门：拒绝保存，不落成「范围为自定部门但谁都看不见」")
    void createCustomWithoutDeptIsRejected() {
        assertThrows(BusinessException.class, () -> service.create(request(OrgDataScope.CUSTOM_DEPT, List.of())));
        verify(sysRoleDeptMapper, never()).insert(any(SysRoleDept.class));
    }

    @Test
    @DisplayName("自定部门保存写入关联行并失效范围缓存")
    void createCustomPersistsDeptRowsAndEvicts() {
        deptsExist(2);

        service.create(request(OrgDataScope.CUSTOM_DEPT, List.of(11L, 12L)));

        ArgumentCaptor<SysRoleDept> captor = ArgumentCaptor.forClass(SysRoleDept.class);
        verify(sysRoleDeptMapper, atLeastOnce()).insert(captor.capture());
        assertEquals(List.of(11L, 12L), captor.getAllValues().stream().map(SysRoleDept::getDeptId).toList());
        verify(orgScopeService).evictAll();
    }

    @Test
    @DisplayName("前端传来的部门 id 不可信：不存在的部门直接拒绝")
    void createCustomRejectsUnknownDept() {
        deptsExist(1);   // 提交 2 个但只查到 1 个

        assertThrows(BusinessException.class,
                () -> service.create(request(OrgDataScope.CUSTOM_DEPT, List.of(11L, 999999L))));
        verify(sysRoleDeptMapper, never()).insert(any(SysRoleDept.class));
    }

    /* ==================== 编辑 ==================== */

    @Test
    @DisplayName("编辑未提交档位 = 不改原值，不会被静默收窄成仅本人")
    void updateWithoutScopeKeepsExistingValue() {
        currentRoleIs(role(9L, OrgDataScope.CUSTOM_DEPT));
        when(sysRoleDeptMapper.selectList(any())).thenReturn(List.of(deptRow(11L)));

        RoleVO vo = service.update(9L, request(null, null));

        assertEquals(OrgDataScope.CUSTOM_DEPT, vo.getDataScope());
        verify(sysRoleDeptMapper, never()).delete(any());
        verify(auditService, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("档位从自定部门改成全部：清空部门残留行并记审计")
    void updateScopeAwayFromCustomClearsDeptRows() {
        currentRoleIs(role(9L, OrgDataScope.CUSTOM_DEPT));
        when(sysRoleDeptMapper.selectList(any())).thenReturn(List.of(deptRow(11L)));

        service.update(9L, request(OrgDataScope.ALL, null));

        verify(sysRoleDeptMapper).delete(any());
        verify(auditService).record(any(), any(), any(), any(), any(), any(), any());
        verify(orgScopeService).evictAll();
    }

    @Test
    @DisplayName("改成全部后返回的范围不再带部门集合，避免前端把旧部门当生效配置")
    void updateToAllReturnsNoDeptIds() {
        currentRoleIs(role(9L, OrgDataScope.DEPT));

        RoleVO vo = service.update(9L, request(OrgDataScope.ALL, List.of(11L)));

        assertEquals(OrgDataScope.ALL, vo.getDataScope());
        assertEquals(List.of(), vo.getDeptIds());
    }

    /* ==================== 删除 ==================== */

    @Test
    @DisplayName("删除角色时一并清理部门行，防止复用同 id 时继承旧范围")
    void deleteCleansDeptRows() {
        currentRoleIs(role(9L, OrgDataScope.CUSTOM_DEPT));
        when(sysRoleDeptMapper.selectList(any())).thenReturn(List.of(deptRow(11L)));

        service.delete(9L);

        verify(sysRoleDeptMapper).delete(any());
    }

    private static SysRoleDept deptRow(long deptId) {
        SysRoleDept rel = new SysRoleDept();
        rel.setRoleId(9L);
        rel.setDeptId(deptId);
        return rel;
    }
}

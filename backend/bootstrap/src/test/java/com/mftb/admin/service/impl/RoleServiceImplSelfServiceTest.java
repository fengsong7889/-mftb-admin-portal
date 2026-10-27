package com.mftb.admin.service.impl;

import com.mftb.admin.dto.RoleRequest;
import com.mftb.admin.dto.RoleVO;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysRoleDeptMapper;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysRoleMenuMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.service.PermissionAuditService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「开放员工自助申请」开关（sys_role.self_service_requestable）的写入口径测试。
 * <p>
 * 这个开关决定角色是否出现在门户「系統權限申請」的参考角色目录里，读者是对目标系统零权限的全体员工，
 * 所以写入侧有三条必须钉死的口径：
 * <ol>
 *   <li><b>内置 admin 角色强制 0</b>：把 admin 放进自助目录等于将「申请整个平台」做成自助入口，
 *       审批人误点一次就交出全部权限（与绑定/删除/停用对 admin 的禁令同一口径）；</li>
 *   <li><b>只认 0/1</b>：2、-1 之类的值一律归一化成 0，避免脏值让目录口径变得不可预测；</li>
 *   <li><b>传 null 表示不改</b>：旧客户端（或只改名称的调用）不传该字段时，必须保留原值——
 *       写成 0 会让一次改名把已开放的目录静默关掉，而操作人根本不知道自己动了它。</li>
 * </ol>
 * 复制角色不继承该开关：新角色应由管理员确认过业务说明后再主动开放，否则一次复制就把暴露面扩散出去。
 */
class RoleServiceImplSelfServiceTest {

    private static final long ROLE_ID = 7L;

    private SysRoleMapper sysRoleMapper;
    private RoleServiceImpl service;

    @BeforeEach
    void setUp() {
        sysRoleMapper = mock(SysRoleMapper.class);
        SysRoleMenuMapper sysRoleMenuMapper = mock(SysRoleMenuMapper.class);
        // 上游 Core HR 整改给 RoleServiceImpl 增加了数据范围依赖，@RequiredArgsConstructor 按字段声明顺序取参，
        // 这里必须同步补齐，否则构造器签名对不上（本测试只关心自助申请开关的写入口径，依赖全部给空实现即可）。
        SysRoleDeptMapper sysRoleDeptMapper = mock(SysRoleDeptMapper.class);
        SysDepartmentMapper sysDepartmentMapper = mock(SysDepartmentMapper.class);
        SysUserMapper sysUserMapper = mock(SysUserMapper.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        PermissionService permissionService = mock(PermissionService.class);
        PermissionAuditService permissionAuditService = mock(PermissionAuditService.class);
        OrgScopeService orgScopeService = mock(OrgScopeService.class);
        service = new RoleServiceImpl(sysRoleMapper, sysRoleMenuMapper, sysRoleDeptMapper, sysDepartmentMapper,
                sysUserMapper, operatorResolver, jdbcTemplate, permissionService, permissionAuditService,
                orgScopeService);

        when(operatorResolver.currentOperatorName()).thenReturn("管理员(MF00001)");
        when(sysRoleMapper.selectCount(any())).thenReturn(0L);
        // loadPermissions 走 jdbcTemplate，返回空即可（本测试只关心开关字段的写入）
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
    }

    private SysRole existingRole(String code) {
        SysRole role = new SysRole();
        role.setId(ROLE_ID);
        role.setCode(code);
        role.setName("考勤管理員");
        role.setStatus(1);
        role.setDeleted(0);
        when(sysRoleMapper.selectById(ROLE_ID)).thenReturn(role);
        return role;
    }

    private static RoleRequest request(Integer selfService) {
        RoleRequest request = new RoleRequest();
        request.setName("考勤管理員");
        request.setDescription("可維護考勤組與排班規則");
        request.setSelfServiceRequestable(selfService);
        return request;
    }

    @Test
    @DisplayName("编辑：显式开启/关闭都按传入值落库，VO 同步返回")
    void updateWritesFlag() {
        existingRole("ATTENDANCE_ADMIN");

        RoleVO opened = service.update(ROLE_ID, request(1));
        assertEquals(Integer.valueOf(1), captureUpdated().getSelfServiceRequestable());
        assertEquals(Integer.valueOf(1), opened.getSelfServiceRequestable(), "VO 要回传开关，界面才能显示当前状态");

        RoleVO closed = service.update(ROLE_ID, request(0));
        assertEquals(Integer.valueOf(0), captureUpdated().getSelfServiceRequestable());
        assertEquals(Integer.valueOf(0), closed.getSelfServiceRequestable());
    }

    @Test
    @DisplayName("编辑：内置 admin 角色即使前端要求开启也强制 0")
    void updateForcesClosedForBuiltinAdmin() {
        existingRole("admin");

        service.update(ROLE_ID, request(1));

        assertEquals(Integer.valueOf(0), captureUpdated().getSelfServiceRequestable(),
                "admin 进自助目录等于把「申请整个平台」做成自助入口");
    }

    @Test
    @DisplayName("编辑：脏值（2 / -1）一律归一化为 0，只认 1 为开放")
    void updateNormalizesDirtyValues() {
        existingRole("ATTENDANCE_ADMIN");

        service.update(ROLE_ID, request(2));
        assertEquals(Integer.valueOf(0), captureUpdated().getSelfServiceRequestable());

        service.update(ROLE_ID, request(-1));
        assertEquals(Integer.valueOf(0), captureUpdated().getSelfServiceRequestable());
    }

    @Test
    @DisplayName("编辑：不传该字段时保留原值，不得把已开放的目录静默关掉")
    void updateKeepsFlagWhenAbsent() {
        SysRole role = existingRole("ATTENDANCE_ADMIN");
        role.setSelfServiceRequestable(1);

        service.update(ROLE_ID, request(null));

        assertEquals(Integer.valueOf(1), captureUpdated().getSelfServiceRequestable(),
                "只改名称/说明的调用不该动自助开关");
    }

    @Test
    @DisplayName("新增：不传该字段时默认不开放（暴露面默认最小）")
    void createDefaultsToClosed() {
        when(sysRoleMapper.insert(any(SysRole.class))).thenReturn(1);

        service.create(request(null));

        ArgumentCaptor<SysRole> captor = ArgumentCaptor.forClass(SysRole.class);
        verify(sysRoleMapper).insert(captor.capture());
        assertEquals(Integer.valueOf(0), captor.getValue().getSelfServiceRequestable());
    }

    @Test
    @DisplayName("复制：即使源角色已开放，新角色也不继承该开关")
    void copyDoesNotInheritFlag() {
        SysRole source = existingRole("ATTENDANCE_ADMIN");
        source.setSelfServiceRequestable(1);
        when(sysRoleMapper.insert(any(SysRole.class))).thenReturn(1);

        service.copy(ROLE_ID, request(1));

        ArgumentCaptor<SysRole> captor = ArgumentCaptor.forClass(SysRole.class);
        verify(sysRoleMapper).insert(captor.capture());
        assertEquals(Integer.valueOf(0), captor.getValue().getSelfServiceRequestable(),
                "一次复制就把暴露面扩散到门户目录是不可接受的");
    }

    /** 取最近一次写库的实体（updateById 传的就是被改动的那个对象） */
    private SysRole captureUpdated() {
        ArgumentCaptor<SysRole> captor = ArgumentCaptor.forClass(SysRole.class);
        verify(sysRoleMapper, org.mockito.Mockito.atLeastOnce()).updateById(captor.capture());
        return captor.getValue();
    }
}

package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.OrgDataScope;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysRoleDept;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysRoleDeptMapper;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 组织数据权限（人员可见范围）解析测试。
 * <p>
 * 覆盖方案 §10.9 验收要求的五档 + 无授权 + 多角色取最大 + 超管直通，
 * 并且每档都有「拒绝断言」（{@code requireVisibleUser} 对范围外人员必须抛错），
 * 而不是只验证接口能否访问 —— 仓内既有员工权限测试的同类不足不可重复。
 */
class OrgScopeServiceTest {

    private static final long SELF_ID = 24L;
    private static final long OTHER_ID = 25L;
    private static final long ROOT_DEPT = 1L;
    private static final long OWN_DEPT = 11L;
    private static final long CHILD_DEPT = 111L;
    private static final long ELSE_DEPT = 2L;

    private OperatorResolver operatorResolver;
    private SysUserMapper sysUserMapper;
    private SysRoleMapper sysRoleMapper;
    private SysRoleDeptMapper sysRoleDeptMapper;
    private SysDepartmentMapper sysDepartmentMapper;
    private OrgScopeServiceImpl service;

    private final SysUser self = user(SELF_ID, "MF00024", "張三", OWN_DEPT, "user");

    @BeforeEach
    void setUp() {
        // 纯 Mockito 不启动 MyBatis：预热实体元数据，避免 Lambda 条件解析不到列名
        for (Class<?> entity : List.of(SysUser.class, SysRole.class, SysRoleDept.class, SysDepartment.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
        operatorResolver = mock(OperatorResolver.class);
        sysUserMapper = mock(SysUserMapper.class);
        sysRoleMapper = mock(SysRoleMapper.class);
        sysRoleDeptMapper = mock(SysRoleDeptMapper.class);
        sysDepartmentMapper = mock(SysDepartmentMapper.class);
        service = new OrgScopeServiceImpl(operatorResolver, sysUserMapper, sysRoleMapper,
                sysRoleDeptMapper, sysDepartmentMapper);

        when(operatorResolver.currentUser()).thenReturn(self);
        // 组织树：1 → 11 → 111，另有并列的 2
        when(sysDepartmentMapper.selectList(any())).thenReturn(List.of(
                dept(ROOT_DEPT, null), dept(OWN_DEPT, ROOT_DEPT), dept(CHILD_DEPT, OWN_DEPT), dept(ELSE_DEPT, ROOT_DEPT)));
        // 部门下的人：mock 无法按条件过滤，返回一批人即可，断言看的是「本人 ∪ 这批人」
        when(sysUserMapper.selectList(any())).thenReturn(List.of(
                user(OTHER_ID, "MF00025", "李四", OWN_DEPT, "user")));
        when(sysRoleDeptMapper.selectList(any())).thenReturn(List.of());
        when(sysRoleMapper.selectList(any())).thenReturn(List.of());
    }

    /* ==================== 夹具 ==================== */

    private static SysUser user(long id, String empId, String name, Long deptId, String role) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setUsername(empId);
        u.setName(name);
        u.setDepartmentId(deptId);
        u.setRole(role);
        u.setStatus(1);
        return u;
    }

    private static SysDepartment dept(long id, Long parentId) {
        SysDepartment d = new SysDepartment();
        d.setId(id);
        d.setParentId(parentId);
        d.setName("部門" + id);
        return d;
    }

    private static SysRole role(long id, String code, Integer dataScope) {
        SysRole r = new SysRole();
        r.setId(id);
        r.setCode(code);
        r.setName("角色" + id);
        r.setStatus(1);
        r.setDataScope(dataScope);
        return r;
    }

    private void loginAs(SysUser user, List<Long> roleIds) {
        SysUser withRoles = user;
        withRoles.setFunctionRoles(JsonUtils.toJson(roleIds));
        when(operatorResolver.currentUser()).thenReturn(withRoles);
    }

    private void roles(SysRole... rows) {
        when(sysRoleMapper.selectList(any())).thenReturn(List.of(rows));
    }

    private void customDepts(long roleId, Long... deptIds) {
        when(sysRoleDeptMapper.selectList(any())).thenReturn(java.util.Arrays.stream(deptIds)
                .map(d -> {
                    SysRoleDept rel = new SysRoleDept();
                    rel.setRoleId(roleId);
                    rel.setDeptId(d);
                    return rel;
                }).toList());
    }

    /** 每个用例独立缓存：服务实例内部按用户缓存 5 分钟，setUp 重建实例即等价于 evict */
    private OrgScopeService fresh() {
        return new OrgScopeServiceImpl(operatorResolver, sysUserMapper, sysRoleMapper,
                sysRoleDeptMapper, sysDepartmentMapper);
    }

    /* ==================== 五档解析 ==================== */

    @Test
    @DisplayName("仅本人：只看得见自己，部门维为空（不得把整部门汇总当个人可见）")
    void selfScopeSeesOnlyOwnUserAndNoDeptRollup() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_self", OrgDataScope.SELF));

        OrgScopeService s = fresh();
        assertEquals(Set.of(SELF_ID), s.resolveVisibleUserIds());
        assertEquals(Set.of(), s.resolveVisibleDeptIds());
    }

    @Test
    @DisplayName("本部门：可见部门只有本人所在部门，且恒定包含自己")
    void deptScopeExpandsOwnDept() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_dept", OrgDataScope.DEPT));

        OrgScopeService s = fresh();
        assertEquals(Set.of(OWN_DEPT), s.resolveVisibleDeptIds());
        Set<Long> users = s.resolveVisibleUserIds();
        assertTrue(users.containsAll(Set.of(SELF_ID, OTHER_ID)), "本部门应含同部门同事: " + users);
    }

    @Test
    @DisplayName("本部门及以下：按组织树闭包展开，不含并列部门")
    void deptAndChildScopeClosesSubTree() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_manager", OrgDataScope.DEPT_AND_CHILD));

        assertEquals(Set.of(OWN_DEPT, CHILD_DEPT), fresh().resolveVisibleDeptIds());
    }

    @Test
    @DisplayName("自定部门：取 sys_role_dept 勾选节点并连同下级展开")
    void customDeptScopeUsesRoleDeptsWithDescendants() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_region", OrgDataScope.CUSTOM_DEPT));
        customDepts(9L, ROOT_DEPT);

        assertEquals(Set.of(ROOT_DEPT, OWN_DEPT, CHILD_DEPT, ELSE_DEPT), fresh().resolveVisibleDeptIds());
    }

    @Test
    @DisplayName("自定部门但没勾任何部门：不放开也不报错，落到只有本人")
    void customDeptScopeWithoutDeptRowsFallsBackToSelfOnly() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_region", OrgDataScope.CUSTOM_DEPT));

        OrgScopeService s = fresh();
        assertEquals(Set.of(SELF_ID), s.resolveVisibleUserIds());
        assertEquals(Set.of(), s.resolveVisibleDeptIds());
    }

    @Test
    @DisplayName("全部：返回 null 表示不限制，不是「全量 id 列表」")
    void allScopeMeansUnrestricted() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_all", OrgDataScope.ALL));

        OrgScopeService s = fresh();
        assertNull(s.resolveVisibleUserIds());
        assertNull(s.resolveVisibleDeptIds());
    }

    /* ==================== 直通与叠加 ==================== */

    @Test
    @DisplayName("主角色 admin 直通：不需要任何功能角色也不查库")
    void builtinAdminByMainRoleIsUnrestricted() {
        loginAs(user(SELF_ID, "MF00001", "超級管理员", OWN_DEPT, "admin"), List.of());

        OrgScopeService s = fresh();
        assertNull(s.resolveVisibleUserIds());
        assertNull(s.resolveVisibleDeptIds());
    }

    @Test
    @DisplayName("绑定 code=admin 的功能角色同样直通（与 PermissionServiceImpl 判定同源）")
    void boundAdminRoleIsUnrestricted() {
        loginAs(self, List.of(9L));
        roles(role(9L, "admin", OrgDataScope.SELF));

        assertNull(fresh().resolveVisibleUserIds());
    }

    @Test
    @DisplayName("多角色取最大：任一角色是全部即不限制")
    void multipleRolesTakeWidest() {
        loginAs(self, List.of(9L, 10L));
        roles(role(9L, "hr_self", OrgDataScope.SELF), role(10L, "hr_all", OrgDataScope.ALL));

        assertNull(fresh().resolveVisibleUserIds());
    }

    @Test
    @DisplayName("多角色并集：仅本人 + 本部门 得到本部门，而不是交集")
    void multipleRolesUnionNotIntersection() {
        loginAs(self, List.of(9L, 10L));
        roles(role(9L, "hr_self", OrgDataScope.SELF), role(10L, "hr_dept", OrgDataScope.DEPT));

        OrgScopeService s = fresh();
        assertEquals(Set.of(OWN_DEPT), s.resolveVisibleDeptIds());
        assertTrue(s.resolveVisibleUserIds().contains(SELF_ID));
    }

    @Test
    @DisplayName("无 SecurityContext（定时任务/内部回调）按不限制放行，否则夜间同步一条都不写")
    void backgroundCallerWithoutLoginContextIsUnrestricted() {
        when(operatorResolver.currentUser()).thenReturn(null);

        OrgScopeService s = fresh();
        assertNull(s.resolveVisibleUserIds());
        assertNull(s.resolveVisibleDeptIds());
    }

    /* ==================== 脏值与下限 ==================== */

    @Test
    @DisplayName("脏档位（null/0/9）一律回落仅本人，绝不因脏数据放大可见范围")
    void illegalScopeValueFallsBackToSelf() {
        loginAs(self, List.of(9L));
        roles(role(9L, "broken", null));
        assertEquals(Set.of(SELF_ID), fresh().resolveVisibleUserIds());

        loginAs(self, List.of(10L));
        roles(role(10L, "broken2", 9));
        assertEquals(Set.of(SELF_ID), fresh().resolveVisibleUserIds());
    }

    @Test
    @DisplayName("没有任何角色：保底只见自己（范围是收敛，不是第二道鉴权）")
    void noRolesStillSeesOwnDataOnly() {
        loginAs(self, List.of());
        // functionRoles 为空 + role=user 查不到角色行 → resolveRoles 返回空
        when(sysRoleMapper.selectList(any())).thenReturn(List.of());

        OrgScopeService s = fresh();
        assertEquals(Set.of(SELF_ID), s.resolveVisibleUserIds());
        assertEquals(Set.of(), s.resolveVisibleDeptIds());
    }

    @Test
    @DisplayName("无部门用户走本部门档：不放开全公司，只剩自己")
    void deptScopeUserWithoutDeptDoesNotWiden() {
        SysUser noDept = user(SELF_ID, "MF00024", "張三", null, "user");
        loginAs(noDept, List.of(9L));
        roles(role(9L, "hr_dept", OrgDataScope.DEPT));

        OrgScopeService s = fresh();
        assertEquals(Set.of(), s.resolveVisibleDeptIds());
        assertEquals(Set.of(SELF_ID), s.resolveVisibleUserIds());
    }

    /* ==================== 单条归属拒绝断言 ==================== */

    @Test
    @DisplayName("仅本人档访问他人数据：必须抛越权，而不是返回空")
    void selfScopeRejectsOtherUser() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_self", OrgDataScope.SELF));

        OrgScopeService s = fresh();
        s.requireVisibleUser(SELF_ID);
        BusinessException ex = assertThrows(BusinessException.class, () -> s.requireVisibleUser(OTHER_ID));
        assertTrue(ex.getMessage().contains("無權"), "拒绝文案应说明无权限: " + ex.getMessage());
    }

    @Test
    @DisplayName("全部档不因 id 被改写而拒绝：范围不限制时按 id 访问任意人员合法")
    void allScopeAcceptsAnyUser() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_all", OrgDataScope.ALL));

        fresh().requireVisibleUser(OTHER_ID);
    }

    @Test
    @DisplayName("目标 id 缺失直接拒绝：不得把 null 当『不限制』放行")
    void nullTargetIsRejected() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_all", OrgDataScope.ALL));

        assertThrows(BusinessException.class, () -> fresh().requireVisibleUser(null));
    }

    /* ==================== 缓存失效 ==================== */

    @Test
    @DisplayName("角色范围变更后 evictAll 生效：否则改了授权中心要等 5 分钟才见效")
    void evictAllPicksUpNewRoleScope() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_self", OrgDataScope.SELF));
        OrgScopeService s = fresh();
        assertEquals(Set.of(SELF_ID), s.resolveVisibleUserIds());

        roles(role(9L, "hr_self", OrgDataScope.DEPT));
        s.evictAll();
        assertEquals(Set.of(SELF_ID, OTHER_ID), s.resolveVisibleUserIds());
    }

    @Test
    @DisplayName("describe() 报告生效档位与是否不限制，供列表页顶部提示")
    void describeReportsEffectiveScope() {
        loginAs(self, List.of(9L));
        roles(role(9L, "hr_dept", OrgDataScope.DEPT));

        var described = fresh().describe();
        assertEquals(OrgDataScope.DEPT, described.get("scope"));
        assertEquals(Boolean.FALSE, described.get("unlimited"));
        assertEquals(1L, described.get("deptCount"));
    }
}

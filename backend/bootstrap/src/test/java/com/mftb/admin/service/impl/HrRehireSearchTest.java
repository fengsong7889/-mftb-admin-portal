package com.mftb.admin.service.impl;

import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.dto.HrEmployeeBriefVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrEffectiveTaskService;
import com.mftb.admin.contracts.hr.HrLifecycleCallbackService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 重新入职的人员候选搜索测试。
 * <p>这里守的是「候选集别搞反」：返聘要的是已离职的人，而**账号停用（status=0）不等于离职**
 * —— 被冻结的在职员工 status 也是 0，让他出现在返聘候选里，下一步就是给在职者凭空开一段新雇佣。
 */
class HrRehireSearchTest {

    private SysUserMapper userMapper;
    private HrAssignmentQuery hrAssignmentQuery;
    private HrLifecycleServiceImpl service;

    @BeforeEach
    void setUp() {
        // 纯 Mockito 环境里 MyBatis-Plus 未注册实体元数据，测试为了断言查询条件而调用
        // getSqlSegment 时会拿不到 lambda 缓存，需先手动初始化 TableInfo。
        org.apache.ibatis.builder.MapperBuilderAssistant assistant =
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), "");
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(assistant, SysUser.class);
        userMapper = mock(SysUserMapper.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        SysUser operator = new SysUser();
        operator.setId(1L);
        operator.setUsername("hr");
        operator.setName("HR專員");
        when(operatorResolver.currentUser()).thenReturn(operator);
        PermissionService permissionService = mock(PermissionService.class);
        // 两个用例分别走 hr-onboarding（返聘）与 hr-dimission（离职）菜单，取人搜索对两者同权
        when(permissionService.hasPermission(any(), any(), eq("view"))).thenReturn(true);
        service = new HrLifecycleServiceImpl(mock(HrLifecycleRequestMapper.class), userMapper,
                mock(SysDepartmentMapper.class), mock(SysPositionMapper.class),
                mock(EmpPositionRecordMapper.class), mock(EmpContractMapper.class),
                mock(OaRequestService.class), mock(BizSeqService.class), operatorResolver,
                permissionService, mock(HrEffectiveTaskService.class), hrAssignmentQuery,
                mock(HrLifecycleCallbackService.class));
    }

    @Test
    @DisplayName("返聘候选只含人事事实为离职的人：停用但未离职的要剔除")
    void rehireCandidatesMustBeActuallyResigned() {
        when(userMapper.selectList(any())).thenReturn(List.of(
                user(11L, "真離職"), user(12L, "凍結在職"), user(13L, "另一離職")));
        when(hrAssignmentQuery.employmentStatusOf(anyList(), any())).thenReturn(Map.of(
                11L, HrAssignmentQuery.STATUS_RESIGNED,
                // 12 号账号 status=0 但人事事实仍在职
                12L, HrAssignmentQuery.STATUS_ACTIVE,
                13L, HrAssignmentQuery.STATUS_RESIGNED));

        List<HrEmployeeBriefVO> result = service.searchEmployees(HrLifecycleConstants.TYPE_REHIRE, "陳");

        assertEquals(List.of(11L, 13L), result.stream().map(HrEmployeeBriefVO::getUserId).toList());
        ArgumentCaptor<List<Long>> ids = ArgumentCaptor.forClass(List.class);
        verify(hrAssignmentQuery).employmentStatusOf(ids.capture(), any());
        assertEquals(List.of(11L, 12L, 13L), ids.getValue(), "判定必须批量做，不能逐个人查库");

        // 返聘不能拿 status 当离职依据：status=0 里混着「冻结的在职者」，
        // 而「已离职但账号被重新启用」的人会被 status=0 完全漏掉（端到端实测缺陷）。
        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>> wrapper =
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class);
        verify(userMapper).selectList(wrapper.capture());
        assertTrue(!wrapper.getValue().getSqlSegment().toLowerCase().contains("status"),
                "返聘候选的 SQL 不该出现账号状态条件: " + wrapper.getValue().getSqlSegment());
    }

    @Test
    @DisplayName("其余单据类型仍按在职取人，不做额外的离职判定")
    void otherTypesStillSearchActiveEmployees() {
        when(userMapper.selectList(any())).thenReturn(List.of(user(21L, "在職")));

        List<HrEmployeeBriefVO> result = service.searchEmployees(HrLifecycleConstants.TYPE_DIMISSION, null);

        assertEquals(1, result.size());
        verify(hrAssignmentQuery, never()).employmentStatusOf(anyList(), any());
        String sql = capturedWrapperSql();
        assertTrue(sql.contains("LIMIT 20"), "在职候选沿用原来的小窗口: " + sql);
    }

    // ── 夹具 ──

    private SysUser user(Long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setEmpId("MF" + id);
        user.setUsername("MF" + id);
        user.setName(name);
        user.setStatus(0);
        return user;
    }

    /** 取 wrapper 里注入的 SQL 片段（同时让 paramNameValuePairs 惰性填充完成） */
    private String capturedWrapperSql() {
        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>> captor =
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class);
        verify(userMapper).selectList(captor.capture());
        return captor.getValue().getSqlSegment() + " " + captor.getValue().getCustomSqlSegment();
    }
}

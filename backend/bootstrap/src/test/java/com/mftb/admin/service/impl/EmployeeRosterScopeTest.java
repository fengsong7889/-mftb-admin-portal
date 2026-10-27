package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 花名册范围收敛取数测试（方案 §7.3「操作权限 × 人员范围 × 字段权限」）。
 * <p>钉三件事：空集必须是「不查库直接空」（不能退化成全量）、可见集合要下推到 SQL、
 * 人员下拉入口（传 null）不受影响 —— 这三条写反一条，就是越权或误伤其它模块。
 */
class EmployeeRosterScopeTest {

    private SysUserMapper sysUserMapper;
    private EmployeeServiceImpl service;

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, SysUser.class);
        sysUserMapper = mock(SysUserMapper.class);
        service = new EmployeeServiceImpl(sysUserMapper, mock(SysDepartmentMapper.class),
                mock(SysPositionMapper.class), mock(SysLoginLogMapper.class),
                mock(EmpPositionRecordMapper.class), mock(HrAssignmentQuery.class),
                mock(HrMasterDataResolver.class), mock(HrEmploymentPeriodService.class),
                mock(HrAuditService.class), mock(PasswordEncoder.class), mock(JdbcTemplate.class),
                mock(OperatorResolver.class), mock(PermissionService.class), mock(BizSeqService.class));
    }

    @Test
    @DisplayName("可见集合为空集时直接返回空，不查库")
    void emptyScopeNeverHitsTheDatabase() {
        PageResult<EmployeeVO> result = service.list(1, 10, null, null, null, null, null, null,
                null, null, null, null, Set.of());

        assertEquals(0L, result.getTotal());
        assertTrue(result.getRecords().isEmpty());
        verify(sysUserMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("可见集合下推成 id IN 条件，而不是拿全量回内存筛")
    void visibleIdsArePushedDownToSql() {
        when(sysUserMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        service.list(1, 10, null, null, null, null, null, null, null, null, null, null,
                Set.of(11L, 12L));

        ArgumentCaptor<LambdaQueryWrapper<SysUser>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(sysUserMapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        assertTrue(sql.contains("id IN"), "可见范围未下推成 IN 条件: " + sql);
        assertTrue(captor.getValue().getParamNameValuePairs().containsValue(11L),
                "可见人员 id 未进入查询参数");
    }

    @Test
    @DisplayName("不传范围（人员下拉入口）时不加 id IN 条件，其它模块选人不被误伤")
    void dropdownCallerStaysUnscoped() {
        when(sysUserMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        service.list(1, 50, "张", null, null, null, null, null, null, null, null, null, null);

        ArgumentCaptor<LambdaQueryWrapper<SysUser>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(sysUserMapper).selectList(captor.capture());
        assertTrue(!captor.getValue().getSqlSegment().contains("id IN"),
                "下拉入口不该带范围条件: " + captor.getValue().getSqlSegment());
    }
}

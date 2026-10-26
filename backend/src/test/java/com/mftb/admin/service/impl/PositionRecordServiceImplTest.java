package com.mftb.admin.service.impl;

import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 职务变动 → 账号投影同步。
 * <p>锁死两条口径：
 * <ul>
 *   <li>已生效的异动必须把部门写回 sys_user（否则花名册/RDM 一直读旧部门），并失效权限缓存；</li>
 *   <li>账号当前部门与生效任职一致时不得无谓写库；未来才生效的异动在 as-of 查询里拿不到，天然不会提前改账号。</li>
 * </ul>
 */
class PositionRecordServiceImplTest {

    private EmpPositionRecordMapper positionRecordMapper;
    private SysUserMapper sysUserMapper;
    private SysDepartmentMapper sysDepartmentMapper;
    private HrAssignmentQuery hrAssignmentQuery;
    private PermissionService permissionService;
    private PositionRecordServiceImpl service;

    @BeforeEach
    void setUp() {
        positionRecordMapper = mock(EmpPositionRecordMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        sysDepartmentMapper = mock(SysDepartmentMapper.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        permissionService = mock(PermissionService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
        service = new PositionRecordServiceImpl(
                positionRecordMapper,
                sysUserMapper,
                sysDepartmentMapper,
                mock(SysPositionMapper.class),
                operatorResolver,
                mock(EmployeeService.class),
                mock(HrMasterDataResolver.class),
                mock(HrEmploymentPeriodService.class),
                mock(HrAuditService.class),
                hrAssignmentQuery,
                permissionService);
    }

    private static SysUser user() {
        SysUser user = new SysUser();
        user.setId(9L);
        user.setEmpId("MF00015");
        user.setName("甄荣康");
        user.setDepartmentId(34L);
        user.setDepartment("後端研發部");
        user.setPosition("技術助理");
        return user;
    }

    private static PositionRecordRequest transferRequest(LocalDate effectiveDate, String serviceDept) {
        PositionRecordRequest request = new PositionRecordRequest();
        request.setEffectiveDate(effectiveDate);
        request.setOperationCode("TRANSFER");
        request.setServiceDept(serviceDept);
        request.setReason("組織調整");
        return request;
    }

    @Test
    @DisplayName("登记已生效的调动后，账号部门同步为任职记录并失效权限缓存")
    void createSyncsAccountDepartment() {
        SysUser user = user();
        when(sysUserMapper.selectById(9L)).thenReturn(user);
        // 同日期无历史记录 → effectiveSeq 起算 0
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        EmpPositionRecord current = new EmpPositionRecord();
        current.setUserId(9L);
        current.setDeptId(33L);
        current.setServiceDept("前端研發部");
        when(hrAssignmentQuery.asOf(eq(9L), any())).thenReturn(Optional.of(current));
        SysDepartment dept = new SysDepartment();
        dept.setId(33L);
        dept.setName("前端研發部");
        dept.setNameEn("Front-end R&D");
        when(sysDepartmentMapper.selectById(33L)).thenReturn(dept);

        service.create(9L, transferRequest(LocalDate.now(), "前端研發部"));

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserMapper).updateById(captor.capture());
        assertEquals(33L, captor.getValue().getDepartmentId(), "部门ID应同步为任职记录的 33");
        assertEquals("前端研發部", captor.getValue().getDepartment(), "部门名称未同步");
        verify(permissionService).evictAll();
    }

    @Test
    @DisplayName("账号部门与生效任职一致时不写库、不刷权限缓存")
    void unchangedProjectionSkipsWrite() {
        SysUser user = user();
        when(sysUserMapper.selectById(9L)).thenReturn(user);
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        EmpPositionRecord current = new EmpPositionRecord();
        current.setUserId(9L);
        current.setDeptId(34L);
        current.setServiceDept("後端研發部");
        when(hrAssignmentQuery.asOf(eq(9L), any())).thenReturn(Optional.of(current));

        service.create(9L, transferRequest(LocalDate.now(), "後端研發部"));

        verify(sysUserMapper, never()).updateById(any(SysUser.class));
        verify(permissionService, never()).evictAll();
    }

    @Test
    @DisplayName("未来才生效的异动不会提前改账号（as-of 只给已生效记录）")
    void futureAssignmentDoesNotTouchAccount() {
        SysUser user = user();
        when(sysUserMapper.selectById(9L)).thenReturn(user);
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        // 未来异动尚未生效：as-of 仍返回旧部门（与账号一致）
        EmpPositionRecord effective = new EmpPositionRecord();
        effective.setUserId(9L);
        effective.setDeptId(34L);
        effective.setServiceDept("後端研發部");
        when(hrAssignmentQuery.asOf(eq(9L), any())).thenReturn(Optional.of(effective));

        service.create(9L, transferRequest(LocalDate.now().plusDays(20), "前端研發部"));

        verify(sysUserMapper, never()).updateById(any(SysUser.class));
        verify(permissionService, never()).evictAll();
    }
}

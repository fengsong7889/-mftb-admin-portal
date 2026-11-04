package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
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
    private HrMasterDataResolver masterDataResolver;
    private PositionRecordServiceImpl service;

    @BeforeEach
    void setUp() {
        positionRecordMapper = mock(EmpPositionRecordMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        sysDepartmentMapper = mock(SysDepartmentMapper.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        permissionService = mock(PermissionService.class);
        // 默认按「名称命中多个同名部门」的真实行为：把 dept_id 抹成 NULL，用来验证显式 ID 不会被它覆写
        masterDataResolver = mock(HrMasterDataResolver.class);
        doAnswer(invocation -> {
            ((EmpPositionRecord) invocation.getArgument(0)).setDeptId(null);
            return null;
        }).when(masterDataResolver).applyStableIds(any(EmpPositionRecord.class));
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
        service = new PositionRecordServiceImpl(
                positionRecordMapper,
                sysUserMapper,
                sysDepartmentMapper,
                mock(SysPositionMapper.class),
                operatorResolver,
                mock(EmployeeService.class),
                masterDataResolver,
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

    /**
     * 同名部门（TB/MF 技术中心下各有前端研發部）按名称归一必然落空，
     * 但用户在部门树上点定了节点，dept_id 就不能再留空。
     */
    @Test
    @DisplayName("显式选定部门 ID 时以该节点为准，不被名称归一的 NULL 覆写")
    void explicitDeptIdOverridesAmbiguousNameResolution() {
        when(sysUserMapper.selectById(9L)).thenReturn(user());
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        SysDepartment mfFrontend = department(36L, "前端研發部", 1);
        when(sysDepartmentMapper.selectById(36L)).thenReturn(mfFrontend);

        PositionRecordRequest request = transferRequest(LocalDate.now(), "前端研發部");
        request.setDeptId(36L);
        // 前端在英文界面选的中英文混写，服务端必须按主数据规范化
        request.setServiceDept("Front-end R&D");

        service.create(9L, request);

        ArgumentCaptor<EmpPositionRecord> captor = ArgumentCaptor.forClass(EmpPositionRecord.class);
        verify(positionRecordMapper).insert(captor.capture());
        assertEquals(36L, captor.getValue().getDeptId(), "显式部门 ID 被名称归一的 NULL 覆写了");
        assertEquals("前端研發部", captor.getValue().getServiceDept(), "名称快照未取自主数据");
    }

    @Test
    @DisplayName("未传部门 ID 时保持旧口径：只按前端传来的名称入库，不猜 ID")
    void missingDeptIdKeepsLegacyNameOnlyPath() {
        when(sysUserMapper.selectById(9L)).thenReturn(user());
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        when(hrAssignmentQuery.asOf(eq(9L), any())).thenReturn(Optional.empty());

        service.create(9L, transferRequest(LocalDate.now(), "前端研發部"));

        ArgumentCaptor<EmpPositionRecord> captor = ArgumentCaptor.forClass(EmpPositionRecord.class);
        verify(positionRecordMapper).insert(captor.capture());
        assertNull(captor.getValue().getDeptId(), "只给名称时不得猜部门 ID");
        assertEquals("前端研發部", captor.getValue().getServiceDept());
        verify(sysDepartmentMapper, never()).selectById(any());
    }

    @Test
    @DisplayName("部门 ID 不存在或已删除时拒写异动")
    void unknownDeptIdIsRejected() {
        when(sysUserMapper.selectById(9L)).thenReturn(user());
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        when(sysDepartmentMapper.selectById(999L)).thenReturn(null);

        PositionRecordRequest request = transferRequest(LocalDate.now(), "前端研發部");
        request.setDeptId(999L);

        assertThrows(BusinessException.class, () -> service.create(9L, request));
        verify(positionRecordMapper, never()).insert(any(EmpPositionRecord.class));
    }

    @Test
    @DisplayName("停用部门即使前端置灰被绕过，服务端仍拒写异动")
    void disabledDeptIdIsRejected() {
        when(sysUserMapper.selectById(9L)).thenReturn(user());
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        when(sysDepartmentMapper.selectById(36L)).thenReturn(department(36L, "前端研發部", 0));

        PositionRecordRequest request = transferRequest(LocalDate.now(), "前端研發部");
        request.setDeptId(36L);

        assertThrows(BusinessException.class, () -> service.create(9L, request));
        verify(positionRecordMapper, never()).insert(any(EmpPositionRecord.class));
    }

    private static SysDepartment department(long id, String name, int status) {
        SysDepartment dept = new SysDepartment();
        dept.setId(id);
        dept.setName(name);
        dept.setStatus(status);
        return dept;
    }
}

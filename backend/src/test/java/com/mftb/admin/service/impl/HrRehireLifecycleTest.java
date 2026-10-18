package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEffectiveTaskService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.HrOffboardingTaskService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「重新入职」办理动作测试（方案 §5.3 返聘、§8「从待入职到离职再入职可完整追溯」）。
 * <p>钉住三条最容易做错的分界：
 * 是否真离职必须走统一 as-of（账号 status 与「最新一条记录」都会骗人）、
 * 必须复用原账号（新建会把同一个人拆成两份档案）、
 * 未来生效的复职绝不能提前启用账号。
 */
class HrRehireLifecycleTest {

    private static final long USER_ID = 66L;
    private static final String FLOW_NO = "RS202610180001";

    private HrLifecycleRequestMapper lifecycleMapper;
    private SysUserMapper userMapper;
    private EmpPositionRecordMapper positionRecordMapper;
    private EmployeeService employeeService;
    private HrEffectiveTaskService effectiveTaskService;
    private HrAssignmentQuery hrAssignmentQuery;
    private HrLifecycleCallbackServiceImpl service;

    @BeforeEach
    void setUp() {
        lifecycleMapper = mock(HrLifecycleRequestMapper.class);
        userMapper = mock(SysUserMapper.class);
        positionRecordMapper = mock(EmpPositionRecordMapper.class);
        employeeService = mock(EmployeeService.class);
        effectiveTaskService = mock(HrEffectiveTaskService.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");
        service = new HrLifecycleCallbackServiceImpl(lifecycleMapper, userMapper,
                mock(SysDepartmentMapper.class), mock(SysPositionMapper.class),
                positionRecordMapper, mock(EmpContractMapper.class), employeeService, operatorResolver,
                effectiveTaskService, mock(HrMasterDataResolver.class),
                mock(HrEmploymentPeriodService.class), mock(HrAuditService.class),
                mock(HrOffboardingTaskService.class), hrAssignmentQuery);
    }

    @Test
    @DisplayName("复职复用原账号、写 REHIRE 异动，并强制改密启用")
    void rehireReusesExistingAccount() {
        stubApprovedRequest(LocalDate.now().minusDays(1));
        when(hrAssignmentQuery.isResignedAt(eq(USER_ID), any())).thenReturn(true);
        // 上一次雇佣的最后一条任职记录（离职），复职要沿用它的法人等字段
        when(positionRecordMapper.selectOne(any())).thenReturn(previousDimissionRecord());

        service.onFlowApproved(FLOW_NO);

        ArgumentCaptor<EmpPositionRecord> captor = ArgumentCaptor.forClass(EmpPositionRecord.class);
        verify(positionRecordMapper).insert(captor.capture());
        EmpPositionRecord record = captor.getValue();
        assertEquals(USER_ID, record.getUserId(), "复职必须挂在原账号上，不能新建人");
        assertEquals(HrOperationCode.REHIRE, record.getOperationCode());
        assertEquals("重新入职", record.getOperation());
        assertEquals("珠海麥峰科技有限公司", record.getCompany(), "复职沿用上一段雇佣的法人快照");
        verify(employeeService).reactivate(USER_ID);
        verify(employeeService, never()).create(any());
    }

    @Test
    @DisplayName("在职员工不能办复职（判定走 as-of，不看账号状态）")
    void activeEmployeeCannotBeRehired() {
        stubApprovedRequest(LocalDate.now().minusDays(1));
        // status=0 但人事事实仍在职（例如被冻结）：必须拒办，否则会给在职者凭空开一段新雇佣
        when(hrAssignmentQuery.isResignedAt(eq(USER_ID), any())).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.onFlowApproved(FLOW_NO));
        assertTrue(ex.getMessage().contains("並非離職狀態"), ex.getMessage());
        verify(positionRecordMapper, never()).insert(any(EmpPositionRecord.class));
        verify(employeeService, never()).reactivate(anyLong());
    }

    @Test
    @DisplayName("复职日期在未来的单据只登记待生效任务，绝不提前启用账号")
    void futureRehireOnlySchedules() {
        stubApprovedRequest(LocalDate.now().plusDays(10));

        service.onFlowApproved(FLOW_NO);

        verify(effectiveTaskService).schedule(any(HrLifecycleRequest.class), any(LocalDate.class), eq("HR專員"));
        verify(positionRecordMapper, never()).insert(any(EmpPositionRecord.class));
        verify(employeeService, never()).reactivate(anyLong());
    }

    // ── 夹具 ──

    private void stubApprovedRequest(LocalDate effectiveDate) {
        HrLifecycleRequest req = new HrLifecycleRequest();
        req.setId(9L);
        req.setReqNo(FLOW_NO);
        req.setType(HrLifecycleConstants.TYPE_REHIRE);
        req.setStatus(HrLifecycleConstants.STATUS_PENDING);
        req.setFlowNo(FLOW_NO);
        req.setUserId(USER_ID);
        req.setEmpName("陳小明");
        req.setEffectiveDate(effectiveDate);
        req.setReason("返聘");
        when(lifecycleMapper.selectList(any())).thenReturn(List.of(req));

        SysUser user = new SysUser();
        user.setId(USER_ID);
        user.setEmpId("MF00066");
        user.setUsername("MF00066");
        user.setName("陳小明");
        user.setStatus(0);
        when(userMapper.selectById(USER_ID)).thenReturn(user);
    }

    private EmpPositionRecord previousDimissionRecord() {
        EmpPositionRecord record = new EmpPositionRecord();
        record.setId(3L);
        record.setUserId(USER_ID);
        record.setEffectiveDate(LocalDate.of(2025, 12, 31));
        record.setEffectiveSeq(0);
        record.setOperationCode(HrOperationCode.DIMISSION);
        record.setOperation(HrOperationCode.CODE_TO_NAME.get(HrOperationCode.DIMISSION));
        record.setCompany("珠海麥峰科技有限公司");
        record.setServiceDept("營運中心");
        record.setPositionName("配送員");
        return record;
    }
}

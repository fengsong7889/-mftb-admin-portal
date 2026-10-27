package com.mftb.admin.service.impl;

import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEffectiveTask;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrEffectiveTaskService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「批准后到生效日前为待生效」的调度测试（方案 §7.2）。
 * <p>
 * 这条规则的唯一失败形态是静默的：未来的调动/离职在审批通过那一刻就把任职投影与账号状态改掉，
 * 于是「下周一离职」的人今天就读成已离职、今天就被踢下线。所以核心断言是
 * **未来的不动、到点的才动**，而不是「有没有调用某个方法」。
 */
class HrEffectiveSchedulingTest {

    private static final long USER_ID = 24L;

    private HrLifecycleRequestMapper lifecycleMapper;
    private SysUserMapper userMapper;
    private EmpPositionRecordMapper positionRecordMapper;
    private HrEffectiveTaskService taskService;
    private HrLifecycleCallbackServiceImpl service;

    @BeforeEach
    void setUp() {
        lifecycleMapper = mock(HrLifecycleRequestMapper.class);
        userMapper = mock(SysUserMapper.class);
        positionRecordMapper = mock(EmpPositionRecordMapper.class);
        taskService = mock(HrEffectiveTaskService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");
        service = new HrLifecycleCallbackServiceImpl(
                lifecycleMapper, userMapper, mock(SysDepartmentMapper.class), mock(SysPositionMapper.class),
                positionRecordMapper, mock(EmpContractMapper.class), mock(EmployeeService.class),
                operatorResolver, taskService, mock(com.mftb.admin.service.HrMasterDataResolver.class), mock(com.mftb.admin.service.HrEmploymentPeriodService.class), mock(com.mftb.admin.service.HrAuditService.class), mock(com.mftb.admin.service.HrOffboardingTaskService.class), mock(com.mftb.admin.service.HrAssignmentQuery.class), mock(com.mftb.admin.service.PermissionService.class));
        when(userMapper.selectById(USER_ID)).thenReturn(user());
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
    }

    private static SysUser user() {
        SysUser u = new SysUser();
        u.setId(USER_ID);
        u.setEmpId("MF00024");
        u.setUsername("MF00024");
        u.setName("張三");
        u.setRole("user");
        return u;
    }

    private HrLifecycleRequest transfer(LocalDate effectiveDate) {
        HrLifecycleRequest req = new HrLifecycleRequest();
        req.setId(7L);
        req.setReqNo("RS202610180007");
        req.setType(HrLifecycleConstants.TYPE_TRANSFER);
        req.setStatus(HrLifecycleConstants.STATUS_PENDING);
        req.setFlowNo("FLOW-7");
        req.setUserId(USER_ID);
        req.setEmpName("張三");
        req.setEffectiveDate(effectiveDate);
        return req;
    }

    private void stubFind(HrLifecycleRequest req) {
        when(lifecycleMapper.selectList(any())).thenReturn(List.of(req));
    }

    /** 捕获最后一次 updateById 的单据状态（同一单据会被多次落库） */
    private HrLifecycleRequest lastSaved() {
        ArgumentCaptor<HrLifecycleRequest> captor = ArgumentCaptor.forClass(HrLifecycleRequest.class);
        verify(lifecycleMapper, org.mockito.Mockito.atLeastOnce()).updateById(captor.capture());
        List<HrLifecycleRequest> all = captor.getAllValues();
        return all.get(all.size() - 1);
    }

    @Test
    @DisplayName("生效日在未来的调动：停在 approved 并登记任务，绝不改写任职投影")
    void futureTransferIsScheduledNotApplied() {
        HrLifecycleRequest req = transfer(LocalDate.now().plusDays(10));
        req.setNewDeptId(10L);
        stubFind(req);

        service.onFlowApproved(req.getFlowNo());

        assertEquals(HrLifecycleConstants.STATUS_APPROVED, lastSaved().getStatus());
        verify(taskService).schedule(any(), eq(req.getEffectiveDate()), any());
        // 未来生效期间：sys_user 部门快照与职务记录都不该动
        verify(userMapper, never()).updateById(any(SysUser.class));
        verify(positionRecordMapper, never()).insert(any(EmpPositionRecord.class));
        assertTrue(lastSaved().getRemark().contains("待生效"));
    }

    @Test
    @DisplayName("生效日就是今天的调动：立即办理并标记任务完成")
    void todayTransferAppliesImmediately() {
        HrLifecycleRequest req = transfer(LocalDate.now());
        stubFind(req);

        service.onFlowApproved(req.getFlowNo());

        assertEquals(HrLifecycleConstants.STATUS_COMPLETED, lastSaved().getStatus());
        verify(taskService, never()).schedule(any(), any(), any());
        verify(taskService).markDone(eq(7L), any());
        verify(positionRecordMapper).insert(any(EmpPositionRecord.class));
    }

    @Test
    @DisplayName("未来最后在职日的离职：账号今天不能停")
    void futureDimissionDoesNotDisableAccountToday() {
        HrLifecycleRequest req = transfer(LocalDate.now().plusDays(5));
        req.setType(HrLifecycleConstants.TYPE_DIMISSION);
        req.setLastWorkDate(LocalDate.now().plusDays(5));
        req.setEffectiveDate(null);
        EmployeeService employeeService = mock(EmployeeService.class);
        service = new HrLifecycleCallbackServiceImpl(
                lifecycleMapper, userMapper, mock(SysDepartmentMapper.class), mock(SysPositionMapper.class),
                positionRecordMapper, mock(EmpContractMapper.class), employeeService,
                mock(OperatorResolver.class), taskService, mock(com.mftb.admin.service.HrMasterDataResolver.class), mock(com.mftb.admin.service.HrEmploymentPeriodService.class), mock(com.mftb.admin.service.HrAuditService.class), mock(com.mftb.admin.service.HrOffboardingTaskService.class), mock(com.mftb.admin.service.HrAssignmentQuery.class), mock(com.mftb.admin.service.PermissionService.class));
        stubFind(req);

        service.onFlowApproved(req.getFlowNo());

        verify(employeeService, never()).updateStatus(anyLong(), any());
        verify(taskService).schedule(any(), eq(LocalDate.now().plusDays(5)), any());
    }

    @Test
    @DisplayName("驳回时作废待生效任务：已驳回的单据到点仍生效等于绕过审批")
    void rejectCancelsScheduledTask() {
        HrLifecycleRequest req = transfer(LocalDate.now().plusDays(10));
        req.setStatus(HrLifecycleConstants.STATUS_PENDING);
        stubFind(req);

        service.onFlowRejected(req.getFlowNo());

        verify(taskService).cancel(eq(7L), any());
        assertEquals(HrLifecycleConstants.STATUS_REJECTED, lastSaved().getStatus());
    }

    @Test
    @DisplayName("办理失败：任务落成 FAILED 并带原因与次数，供界面重试")
    void applyFailureMarksTaskFailed() {
        HrLifecycleRequest req = transfer(LocalDate.now());
        // 调入部门不存在 → applyTransfer 抛业务异常
        req.setNewDeptId(999L);
        stubFind(req);
        when(userMapper.selectById(USER_ID)).thenReturn(user());

        org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
                () -> service.onFlowApproved(req.getFlowNo()));

        ArgumentCaptor<String> error = ArgumentCaptor.forClass(String.class);
        verify(taskService).markFailed(eq(7L), any(), error.capture(), any());
        assertTrue(error.getValue().contains("部門"), "失败原因要可定位: " + error.getValue());
    }
}


package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.entity.EmpContract;
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
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** HR 入转调离审批回调：状态机与四类办理动作的单元验证（mock 数据层，不连库）。 */
class HrLifecycleCallbackServiceImplTest {

    private HrLifecycleRequestMapper lifecycleMapper;
    private SysUserMapper userMapper;
    private EmpPositionRecordMapper positionRecordMapper;
    private EmpContractMapper contractMapper;
    private EmployeeService employeeService;
    private HrLifecycleCallbackServiceImpl service;

    @BeforeEach
    void setUp() {
        lifecycleMapper = mock(HrLifecycleRequestMapper.class);
        userMapper = mock(SysUserMapper.class);
        positionRecordMapper = mock(EmpPositionRecordMapper.class);
        contractMapper = mock(EmpContractMapper.class);
        employeeService = mock(EmployeeService.class);
        service = new HrLifecycleCallbackServiceImpl(
                lifecycleMapper, userMapper, mock(SysDepartmentMapper.class), mock(SysPositionMapper.class),
                positionRecordMapper, contractMapper, employeeService, mock(OperatorResolver.class));
    }

    private HrLifecycleRequest request(String type, String status) {
        HrLifecycleRequest req = new HrLifecycleRequest();
        req.setId(1L);
        req.setReqNo("RS202609260001");
        req.setType(type);
        req.setStatus(status);
        req.setFlowNo("RS202609260001");
        req.setEmpName("張三");
        req.setEffectiveDate(LocalDate.of(2026, 10, 1));
        return req;
    }

    private void stubFind(HrLifecycleRequest req) {
        when(lifecycleMapper.selectList(any())).thenReturn(List.of(req));
    }

    @Test
    void isHrLifecycleProcessOnlyForHrCodes() {
        assertEquals(true, service.isHrLifecycleProcess("hr_onboard"));
        assertEquals(true, service.isHrLifecycleProcess("hr_dimission"));
        assertEquals(false, service.isHrLifecycleProcess("oa_purchase"));
        assertEquals(false, service.isHrLifecycleProcess(null));
    }

    @Test
    void approvedOnboardCreatesAccountAndCompletes() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_ONBOARD, HrLifecycleConstants.STATUS_PENDING);
        req.setDeptId(10L);
        req.setPositionId(20L);
        stubFind(req);
        EmployeeVO created = new EmployeeVO();
        created.setId(99L);
        created.setEmpId("MF00088");
        when(employeeService.create(any())).thenReturn(created);

        service.onFlowApproved(req.getFlowNo());

        verify(employeeService).create(argThat(er ->
                "張三".equals(er.getName())
                        && Long.valueOf(10L).equals(er.getDepartmentId())
                        && Long.valueOf(20L).equals(er.getPositionId())
                        && "MF0001".equals(er.getPassword())));
        assertEquals(HrLifecycleConstants.STATUS_COMPLETED, req.getStatus());
        assertEquals(99L, req.getUserId());
        assertEquals("MF00088", req.getEmpNo());
    }

    @Test
    void completedRequestIsSkippedForIdempotency() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_ONBOARD, HrLifecycleConstants.STATUS_COMPLETED);
        stubFind(req);

        service.onFlowApproved(req.getFlowNo());

        verify(employeeService, never()).create(any());
        assertEquals(HrLifecycleConstants.STATUS_COMPLETED, req.getStatus());
    }

    @Test
    void regularAppendsPositionRecord() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_REGULAR, HrLifecycleConstants.STATUS_PENDING);
        req.setUserId(5L);
        stubFind(req);
        SysUser user = new SysUser();
        user.setId(5L);
        user.setEmpId("MF00005");
        user.setName("李四");
        when(userMapper.selectById(5L)).thenReturn(user);
        EmpPositionRecord latest = new EmpPositionRecord();
        latest.setServiceDept("技術部");
        latest.setPositionName("後端工程師");
        latest.setCompany("珠海閃蜂科技有限公司");
        latest.setEffectiveSeq(2);
        when(positionRecordMapper.selectList(any())).thenReturn(List.of(latest));
        when(positionRecordMapper.selectOne(any())).thenReturn(latest);

        service.onFlowApproved(req.getFlowNo());

        ArgumentCaptor<EmpPositionRecord> captor = ArgumentCaptor.forClass(EmpPositionRecord.class);
        verify(positionRecordMapper).insert(captor.capture());
        EmpPositionRecord record = captor.getValue();
        assertEquals(HrLifecycleConstants.OPERATION_REGULAR, record.getOperation());
        assertEquals(3, record.getEffectiveSeq());
        assertEquals("技術部", record.getServiceDept());
        assertEquals(HrLifecycleConstants.STATUS_COMPLETED, req.getStatus());
    }

    @Test
    void dimissionDisablesAccountAndWritesRecord() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_DIMISSION, HrLifecycleConstants.STATUS_PENDING);
        req.setUserId(6L);
        req.setLastWorkDate(LocalDate.of(2026, 9, 30));
        stubFind(req);
        SysUser user = new SysUser();
        user.setId(6L);
        user.setEmpId("MF00006");
        when(userMapper.selectById(6L)).thenReturn(user);
        when(positionRecordMapper.selectOne(any())).thenReturn(null);
        when(positionRecordMapper.selectList(any())).thenReturn(List.of());

        service.onFlowApproved(req.getFlowNo());

        ArgumentCaptor<EmpPositionRecord> captor = ArgumentCaptor.forClass(EmpPositionRecord.class);
        verify(positionRecordMapper).insert(captor.capture());
        assertEquals(HrLifecycleConstants.OPERATION_DIMISSION, captor.getValue().getOperation());
        verify(employeeService).updateStatus(6L, 0);
        assertEquals(HrLifecycleConstants.STATUS_COMPLETED, req.getStatus());
    }

    @Test
    void applyFailureStaysApprovedWithReason() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_TRANSFER, HrLifecycleConstants.STATUS_PENDING);
        req.setUserId(7L);
        stubFind(req);
        // 员工不存在 → 办理抛业务异常，单据停在 approved 并记录失败原因
        when(userMapper.selectById(7L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> service.onFlowApproved(req.getFlowNo()));

        assertEquals(HrLifecycleConstants.STATUS_APPROVED, req.getStatus());
        verify(lifecycleMapper, times(2)).updateById(req);
        org.junit.jupiter.api.Assertions.assertTrue(
                req.getRemark() != null && req.getRemark().contains("辦理失敗"));
    }

    @Test
    void renewCreatesNewContractAndTerminatesOld() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_RENEW, HrLifecycleConstants.STATUS_PENDING);
        req.setContractId(77L);
        req.setNewContractEndDate(LocalDate.of(2029, 9, 30));
        stubFind(req);

        EmpContract origin = new EmpContract();
        origin.setId(77L);
        origin.setUserId(5L);
        origin.setContractNo("HT2024-001");
        origin.setContractType("劳动合同");
        origin.setCompany("珠海閃蜂科技有限公司");
        origin.setStartDate(LocalDate.of(2023, 10, 1));
        origin.setEndDate(LocalDate.of(2026, 9, 30));
        origin.setStatus(HrLifecycleConstants.CONTRACT_STATUS_ACTIVE);
        when(contractMapper.selectById(77L)).thenReturn(origin);
        when(contractMapper.selectCount(any())).thenReturn(1L);

        service.onFlowApproved(req.getFlowNo());

        ArgumentCaptor<EmpContract> captor = ArgumentCaptor.forClass(EmpContract.class);
        verify(contractMapper).insert(captor.capture());
        EmpContract created = captor.getValue();
        // 编号自动派生为 原编号-R{合同数+1}，开始日默认取原合同结束日次日
        assertEquals("HT2024-001-R2", created.getContractNo());
        assertEquals(LocalDate.of(2026, 10, 1), created.getStartDate());
        assertEquals(LocalDate.of(2029, 9, 30), created.getEndDate());
        assertEquals(HrLifecycleConstants.CONTRACT_STATUS_ACTIVE, created.getStatus());
        assertEquals(5L, created.getUserId());
        // 原合同置为已终止（不物理删除，保留可追溯）
        assertEquals(HrLifecycleConstants.CONTRACT_STATUS_TERMINATED, origin.getStatus());
        verify(contractMapper).updateById(origin);
        assertEquals(HrLifecycleConstants.STATUS_COMPLETED, req.getStatus());
    }

    @Test
    void renewRejectsAlreadyTerminatedContract() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_RENEW, HrLifecycleConstants.STATUS_PENDING);
        req.setContractId(88L);
        req.setNewContractEndDate(LocalDate.of(2029, 9, 30));
        stubFind(req);
        EmpContract terminated = new EmpContract();
        terminated.setId(88L);
        terminated.setStatus(HrLifecycleConstants.CONTRACT_STATUS_TERMINATED);
        when(contractMapper.selectById(88L)).thenReturn(terminated);

        assertThrows(BusinessException.class, () -> service.onFlowApproved(req.getFlowNo()));
        verify(contractMapper, never()).insert(any(EmpContract.class));
    }

    @Test
    void rejectedFlowMarksRequestRejected() {
        HrLifecycleRequest req = request(HrLifecycleConstants.TYPE_ONBOARD, HrLifecycleConstants.STATUS_PENDING);
        stubFind(req);

        service.onFlowRejected(req.getFlowNo());

        assertEquals(HrLifecycleConstants.STATUS_REJECTED, req.getStatus());
    }
}

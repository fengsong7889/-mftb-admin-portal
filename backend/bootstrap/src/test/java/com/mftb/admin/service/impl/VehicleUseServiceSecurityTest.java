package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.VehicleUseDto;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.Vehicle;
import com.mftb.admin.entity.VehicleTrip;
import com.mftb.admin.entity.VehicleUse;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.VehicleMapper;
import com.mftb.admin.mapper.VehicleTripMapper;
import com.mftb.admin.mapper.VehicleUseEventMapper;
import com.mftb.admin.mapper.VehicleUseMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 用车单服务的安全与状态口径测试。
 *
 * <p>覆盖的是"一旦写错就会造成事实性错误"的路径：越权办理、时段冲突放行、
 * 事后补点出车、里程倒退被接受、钥匙未还却归档、以及把直接登记伪装成审批通过。
 * 与前端 vehicleRules.test.ts 的 41 项断言同口径，两侧不一致时以本文件为准（后端是安全边界）。
 */
class VehicleUseServiceSecurityTest {

    private VehicleUseMapper useMapper;
    private VehicleTripMapper tripMapper;
    private VehicleMapper vehicleMapper;
    private VehicleUseEventMapper eventMapper;
    private SysUserMapper userMapper;
    private VehicleAccessGuard guard;
    private OperatorResolver operatorResolver;
    private BizSeqService bizSeqService;
    private VehicleUseServiceImpl service;

    private static final SysUser OPERATOR = user(100L, "MF00001", "張車管");
    private static final SysUser DRIVER = user(200L, "MF00020", "李司機");

    private static SysUser user(long id, String empNo, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empNo);
        u.setName(name);
        u.setDepartmentId(10L);
        u.setDepartment("總裁辦");
        u.setRole("user");
        return u;
    }

    private static Vehicle vehicle(long id, String plate, int allowDirect) {
        Vehicle v = new Vehicle();
        v.setId(id);
        v.setVehicleCode("VH00000" + id);
        v.setPlateNo(plate);
        v.setRegisterRegion("澳門");
        v.setVehicleType("商務車");
        v.setSeatCount(7);
        v.setCurrentOdometer(new BigDecimal("42180"));
        v.setStatus(VehicleConstants.VEHICLE_NORMAL);
        v.setAllowDirectRegister(allowDirect);
        v.setVersion(0L);
        return v;
    }

    private static VehicleUse use(long id, String status, String source, String approval) {
        VehicleUse u = new VehicleUse();
        u.setId(id);
        u.setUseNo("YC20261009000" + id);
        u.setSource(source);
        u.setApprovalOutcome(approval);
        u.setStatus(status);
        u.setApplicantId(OPERATOR.getId());
        u.setApplicantName(OPERATOR.getName());
        u.setApplicantEmpNo(OPERATOR.getEmpId());
        u.setActualUserName("周經理");
        u.setDepartmentId(10L);
        u.setDepartmentName("總裁辦");
        u.setFinalVehicleId(1L);
        u.setFinalPlateNo("MT-88-01");
        u.setDriverId(DRIVER.getId());
        u.setDriverName(DRIVER.getName());
        u.setDriverEmpNo(DRIVER.getEmpId());
        u.setDrivingMode(VehicleConstants.MODE_COMPANY_DRIVER);
        u.setPassengerCount(3);
        u.setPurpose("客戶拜訪");
        u.setPlannedStart(LocalDateTime.parse("2026-10-09T09:00:00"));
        u.setPlannedEnd(LocalDateTime.parse("2026-10-09T12:00:00"));
        u.setVersion(0);
        u.setCreatedBy("system");
        u.setUpdatedBy("system");
        return u;
    }

    private static VehicleTrip trip(VehicleUse use, String status) {
        VehicleTrip t = new VehicleTrip();
        t.setId(9L);
        t.setUseId(use.getId());
        t.setVehicleId(use.getFinalVehicleId());
        t.setVehiclePlateNo(use.getFinalPlateNo());
        t.setDriverId(use.getDriverId());
        t.setDriverName(use.getDriverName());
        t.setDriverEmpNo(use.getDriverEmpNo());
        t.setStatus(status);
        t.setDepartAt(LocalDateTime.parse("2026-10-09T08:55:00"));
        t.setStartOdometer(new BigDecimal("42180"));
        t.setKeyReceived(1);
        t.setConditionOk(1);
        t.setVersion(0);
        return t;
    }

    @BeforeEach
    void setUp() {
        useMapper = mock(VehicleUseMapper.class);
        tripMapper = mock(VehicleTripMapper.class);
        vehicleMapper = mock(VehicleMapper.class);
        eventMapper = mock(VehicleUseEventMapper.class);
        userMapper = mock(SysUserMapper.class);
        guard = mock(VehicleAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        bizSeqService = mock(BizSeqService.class);
        service = new VehicleUseServiceImpl(useMapper, tripMapper, vehicleMapper, eventMapper,
                userMapper, mock(SysDepartmentMapper.class), guard, bizSeqService, operatorResolver);

        when(guard.currentUser()).thenReturn(OPERATOR);
        when(guard.vehicleBlockers(any(), any())).thenReturn(List.of());
        when(guard.qualificationBlockers(any(), any(), any())).thenReturn(List.of());
        when(guard.deptAllowed(anyLong(), any())).thenReturn(true);
        when(operatorResolver.operatorSignature(any())).thenReturn("張車管(MF00001)");
        when(userMapper.selectById(DRIVER.getId())).thenReturn(DRIVER);
        when(eventMapper.countByIdempotencyKey(anyLong(), any())).thenReturn(0L);
        when(bizSeqService.next(BizSeqService.RULE_VEHICLE_USE)).thenReturn("YC202610090001");
        when(useMapper.findConflictUseNos(any(), any(), any(), any(), any())).thenReturn(List.of());
        // 模拟真库行为：insert 回填主键、版本化更新受影响 1 行
        when(useMapper.insert(any(VehicleUse.class))).thenAnswer(inv -> {
            inv.getArgument(0, VehicleUse.class).setId(77L);
            return 1;
        });
        when(useMapper.updateStatusVersioned(anyLong(), any(), any(), org.mockito.ArgumentMatchers.anyInt(), any()))
                .thenReturn(1);
    }

    /* ==================== 授权直接登记的四重前置 ==================== */

    @Test
    @DisplayName("缺少直接登记原因一律拒绝")
    void directRegisterRequiresReason() {
        VehicleUseDto.DirectRegister dto = new VehicleUseDto.DirectRegister();
        dto.setVehicleId(1L);
        dto.setDriverId(DRIVER.getId());
        dto.setPurpose("緊急接待");
        dto.setDirectReason("  ");
        assertThrows(BusinessException.class, () -> service.directRegister(dto));
        verify(vehicleMapper, never()).selectForUpdate(anyLong());
    }

    @Test
    @DisplayName("车辆未开启直接登记开关时不得走该路径")
    void directRegisterBlockedWhenSwitchOff() {
        when(vehicleMapper.selectForUpdate(1L)).thenReturn(vehicle(1L, "MT-88-01", 0));
        VehicleUseDto.DirectRegister dto = directDto();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.directRegister(dto));
        assertTrue(ex.getMessage().contains("未開啟授權直接登記"), ex.getMessage());
        verify(useMapper, never()).insert(any(VehicleUse.class));
    }

    @Test
    @DisplayName("非该车授权管理人员不得直接登记")
    void directRegisterRequiresManageGrant() {
        when(vehicleMapper.selectForUpdate(1L)).thenReturn(vehicle(1L, "MT-88-01", 1));
        org.mockito.Mockito.doThrow(new BusinessException("您不是該車輛的授權管理人員"))
                .when(guard).requireManageVehicle(OPERATOR, 1L, "授權直接登記");

        assertThrows(BusinessException.class, () -> service.directRegister(directDto()));
        verify(useMapper, never()).insert(any(VehicleUse.class));
    }

    @Test
    @DisplayName("时段被占用时不得直接登记")
    void directRegisterBlockedByConflict() {
        when(vehicleMapper.selectForUpdate(1L)).thenReturn(vehicle(1L, "MT-88-01", 1));
        when(useMapper.findConflictUseNos(any(), any(), any(), any(), any()))
                .thenReturn(List.of("YC202610090002"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.directRegister(directDto()));
        assertTrue(ex.getMessage().contains("占用"), ex.getMessage());
    }

    @Test
    @DisplayName("驾驶资格无效时不得直接登记")
    void directRegisterBlockedByQualification() {
        when(vehicleMapper.selectForUpdate(1L)).thenReturn(vehicle(1L, "MT-88-01", 1));
        when(guard.qualificationBlockers(any(), any(), any()))
                .thenReturn(List.of("李司機 的駕駛資格已過有效期"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.directRegister(directDto()));
        assertTrue(ex.getMessage().contains("駕駛資格"), ex.getMessage());
    }

    @Test
    @DisplayName("直接登记落库的审批结论是 direct，绝不写成 approved")
    void directRegisterNeverMimicsApproval() {
        when(vehicleMapper.selectForUpdate(1L)).thenReturn(vehicle(1L, "MT-88-01", 1));

        service.directRegister(directDto());

        var captor = org.mockito.ArgumentCaptor.forClass(VehicleUse.class);
        verify(useMapper).insert(captor.capture());
        VehicleUse saved = captor.getValue();
        assertEquals(VehicleConstants.SOURCE_DIRECT, saved.getSource());
        assertEquals(VehicleConstants.APPROVAL_DIRECT, saved.getApprovalOutcome());
        assertEquals(VehicleConstants.STATUS_TO_DEPART, saved.getStatus());
        // 驾驶人姓名取员工档案而不是前端传值
        assertEquals("李司機", saved.getDriverName());
        assertEquals("MF00020", saved.getDriverEmpNo());
    }

    /* ==================== 出车 / 归还 / 确认 ==================== */

    @Test
    @DisplayName("批准时段已过且未出车的单不允许补点出车")
    void departRejectsRetroactiveStart() {
        VehicleUse u = use(1L, VehicleConstants.STATUS_TO_DEPART, VehicleConstants.SOURCE_OA, VehicleConstants.APPROVAL_APPROVED);
        u.setPlannedStart(LocalDateTime.parse("2020-01-01T09:00:00"));
        u.setPlannedEnd(LocalDateTime.parse("2020-01-01T12:00:00"));
        when(useMapper.selectForUpdate(1L)).thenReturn(u);
        when(vehicleMapper.selectForUpdate(1L)).thenReturn(vehicle(1L, "MT-88-01", 1));

        VehicleUseDto.Depart dto = new VehicleUseDto.Depart();
        dto.setUseId(1L);
        dto.setDepartAt(LocalDateTime.parse("2020-01-01T15:00:00"));
        dto.setStartOdometer(new BigDecimal("42180"));
        dto.setKeyReceived(true);
        dto.setConditionOk(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.depart(dto));
        assertTrue(ex.getMessage().contains("補點出車"), ex.getMessage());
    }

    @Test
    @DisplayName("里程倒退在归还登记时被拒绝，且不覆盖批准时段")
    void returnRejectsOdometerRollback() {
        VehicleUse u = use(1L, VehicleConstants.STATUS_IN_USE, VehicleConstants.SOURCE_OA, VehicleConstants.APPROVAL_APPROVED);
        when(useMapper.selectForUpdate(1L)).thenReturn(u);
        when(tripMapper.selectByUseForUpdate(1L)).thenReturn(trip(u, VehicleConstants.TRIP_DEPARTED));

        VehicleUseDto.Return dto = new VehicleUseDto.Return();
        dto.setUseId(1L);
        dto.setReturnAt(LocalDateTime.parse("2026-10-09T11:00:00"));
        dto.setEndOdometer(new BigDecimal("42000"));
        dto.setReturnPlace("公司車位");
        dto.setKeyReturned(true);
        dto.setVehicleCondition("normal");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.ret(dto));
        assertTrue(ex.getMessage().contains("授權更正"), ex.getMessage());
        verify(tripMapper, never()).updateById(any(VehicleTrip.class));
    }

    @Test
    @DisplayName("晚归据实登记：只加超时标识，批准时段保持原值")
    void lateReturnMarksFlagWithoutRewritingApproval() {
        VehicleUse u = use(1L, VehicleConstants.STATUS_IN_USE, VehicleConstants.SOURCE_OA, VehicleConstants.APPROVAL_APPROVED);
        VehicleTrip t = trip(u, VehicleConstants.TRIP_DEPARTED);
        when(useMapper.selectForUpdate(1L)).thenReturn(u);
        when(tripMapper.selectByUseForUpdate(1L)).thenReturn(t);

        VehicleUseDto.Return dto = new VehicleUseDto.Return();
        dto.setUseId(1L);
        dto.setReturnAt(LocalDateTime.parse("2026-10-09T13:20:00"));
        dto.setEndOdometer(new BigDecimal("42280"));
        dto.setReturnPlace("公司車位");
        dto.setKeyReturned(true);
        dto.setVehicleCondition("normal");

        service.ret(dto);

        assertEquals(LocalDateTime.parse("2026-10-09T12:00:00"), u.getPlannedEnd(), "批准时段不得被倒改");
        assertTrue(t.getFlags().contains(VehicleConstants.FLAG_OVERDUE), t.getFlags());
        assertEquals(0, t.getMileage().compareTo(new BigDecimal("100")), "行駛里程 = 結束 - 起始");
        assertEquals(VehicleConstants.STATUS_TO_CONFIRM, u.getStatus());
    }

    @Test
    @DisplayName("钥匙未交还时不得确认归档")
    void confirmBlockedWhenKeyNotReturned() {
        VehicleUse u = use(1L, VehicleConstants.STATUS_TO_CONFIRM, VehicleConstants.SOURCE_OA, VehicleConstants.APPROVAL_APPROVED);
        VehicleTrip t = trip(u, VehicleConstants.TRIP_RETURNED);
        t.setReturnAt(LocalDateTime.parse("2026-10-09T11:00:00"));
        t.setEndOdometer(new BigDecimal("42280"));
        t.setMileage(new BigDecimal("100"));
        t.setKeyReturned(0);
        t.setVehicleCondition("normal");
        when(useMapper.selectForUpdate(1L)).thenReturn(u);
        when(tripMapper.selectByUseForUpdate(1L)).thenReturn(t);

        VehicleUseDto.Confirm dto = new VehicleUseDto.Confirm();
        dto.setUseId(1L);
        dto.setReason("無誤");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.confirm(dto));
        assertTrue(ex.getMessage().contains("鑰匙"), ex.getMessage());
        verify(tripMapper, never()).confirmTrip(anyLong(), any(), any(), any(), org.mockito.ArgumentMatchers.anyInt(), any());
    }

    @Test
    @DisplayName("状态不匹配的单据不得越级推进")
    void confirmRejectsWrongStatus() {
        when(useMapper.selectForUpdate(1L)).thenReturn(use(1L, VehicleConstants.STATUS_TO_DEPART,
                VehicleConstants.SOURCE_OA, VehicleConstants.APPROVAL_APPROVED));
        VehicleUseDto.Confirm dto = new VehicleUseDto.Confirm();
        dto.setUseId(1L);
        dto.setReason("x");
        assertThrows(BusinessException.class, () -> service.confirm(dto));
    }

    /* ==================== 状态机 ==================== */

    @Test
    @DisplayName("状态机禁止跳过安排直接出车，也禁止从已完成回退")
    void stateMachineForbidsSkipAndRollback() {
        assertTrue(VehicleConstants.canTransition(VehicleConstants.STATUS_APPROVING, VehicleConstants.STATUS_TO_ASSIGN));
        assertTrue(VehicleConstants.canTransition(VehicleConstants.STATUS_TO_DEPART, VehicleConstants.STATUS_IN_USE));
        assertTrue(VehicleConstants.canTransition(VehicleConstants.STATUS_TO_DEPART, VehicleConstants.STATUS_TO_ASSIGN),
                "允许改派回待安排");
        assertFalse(VehicleConstants.canTransition(VehicleConstants.STATUS_APPROVING, VehicleConstants.STATUS_IN_USE));
        assertFalse(VehicleConstants.canTransition(VehicleConstants.STATUS_COMPLETED, VehicleConstants.STATUS_IN_USE));
        assertFalse(VehicleConstants.canTransition(VehicleConstants.STATUS_IN_USE, VehicleConstants.STATUS_CANCELLED),
                "已出车只能据实归还");
    }

    @Test
    @DisplayName("占用状态集合与冲突 SQL 的口径一致：待安排不算占用")
    void toAssignDoesNotOccupyVehicle() {
        assertFalse(VehicleConstants.OCCUPYING_STATUSES.contains(VehicleConstants.STATUS_TO_ASSIGN));
        assertTrue(VehicleConstants.OCCUPYING_STATUSES.contains(VehicleConstants.STATUS_TO_DEPART));
        assertTrue(VehicleConstants.OCCUPYING_STATUSES.contains(VehicleConstants.STATUS_TO_CONFIRM),
                "未确认归还仍占车");
    }

    /* ==================== 辅助 ==================== */

    private VehicleUseDto.DirectRegister directDto() {
        VehicleUseDto.DirectRegister dto = new VehicleUseDto.DirectRegister();
        dto.setVehicleId(1L);
        dto.setDriverId(DRIVER.getId());
        dto.setDepartmentId(10L);
        dto.setActualUserName("周經理");
        dto.setPurpose("緊急客戶接待");
        dto.setOrigin("公司");
        dto.setDestination("氹仔");
        dto.setPlannedStart(LocalDateTime.parse("2026-10-09T14:00:00"));
        dto.setPlannedEnd(LocalDateTime.parse("2026-10-09T16:00:00"));
        dto.setPassengerCount(3);
        dto.setDirectReason("客戶臨時改約，經電話授權");
        return dto;
    }
}

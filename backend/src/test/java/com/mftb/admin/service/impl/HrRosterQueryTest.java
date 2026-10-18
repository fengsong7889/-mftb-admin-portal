package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrRosterQueryService;
import com.mftb.admin.service.OrgScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 花名册默认列派生测试（方案 §5.1 + §7.1）。
 * <p>核心钉的是「不敢说的时候说不清」：缺入职锚点必须 UNVERIFIED、缺转正事实必须 UNKNOWN，
 * 而不是回落到账号创建日或「试用期」——那两类猜测会直接进薪酬与福利筛选。
 */
class HrRosterQueryTest {

    private static final long USER_ID = 41L;
    private static final LocalDate TODAY = LocalDate.now();

    private EmployeeService employeeService;
    private HrAssignmentQuery hrAssignmentQuery;
    private HrEmploymentPeriodService employmentPeriodService;
    private OrgScopeService orgScopeService;
    private HrRosterQueryServiceImpl service;

    @BeforeEach
    void setUp() {
        employeeService = mock(EmployeeService.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        employmentPeriodService = mock(HrEmploymentPeriodService.class);
        orgScopeService = mock(OrgScopeService.class);
        service = new HrRosterQueryServiceImpl(employeeService, hrAssignmentQuery,
                employmentPeriodService, orgScopeService);

        when(employeeService.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any())).thenReturn(new PageResult<>(
                List.of(employee()), 1L));
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(Set.of(USER_ID));
        when(employmentPeriodService.listByUsers(anyCollection())).thenReturn(Map.of());
    }

    @Test
    @DisplayName("as-of 任职记录提供法人/类别/地点/上级，并把可见集合下传给 list")
    void fillsColumnsFromEffectiveAssignment() {
        when(hrAssignmentQuery.asOfRecords(anyCollection(), any())).thenReturn(Map.of(USER_ID,
                record(2L, TODAY.minusMonths(2), HrOperationCode.TRANSFER, "珠海閃蜂科技有限公司")));
        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of(USER_ID, List.of(
                record(1L, LocalDate.of(2024, 3, 1), HrOperationCode.ONBOARD, null))));
        when(employmentPeriodService.listByUsers(anyCollection())).thenReturn(Map.of());

        EmployeeVO vo = service.roster(1, 10, null, null, null, null, null, null,
                null, null, null, null).getRecords().get(0);

        assertEquals("珠海閃蜂科技有限公司", vo.getEmployerCompany());
        assertEquals("正式員工", vo.getEmployeeCategory());
        assertEquals("珠海", vo.getWorkLocation());
        assertEquals("王上級", vo.getDirectSuperior());
        // 花名册必须带范围；null 会被当成「不限制」，那是另一条链路（下拉）的语义
        verify(employeeService).list(eq(1L), eq(10L), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), eq(Set.of(USER_ID)));
    }

    @Test
    @DisplayName("已登记的雇佣期间优先：HR 人工确认的入职日不被任职登记日覆盖")
    void registeredPeriodWinsOverPositionRecord() {
        when(hrAssignmentQuery.asOfRecords(anyCollection(), any())).thenReturn(Map.of());
        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of(USER_ID, List.of(
                record(1L, LocalDate.of(2024, 3, 1), HrOperationCode.ONBOARD, null))));
        HrEmploymentPeriod period = new HrEmploymentPeriod();
        period.setUserId(USER_ID);
        period.setPeriodSeq(1);
        period.setStartDate(LocalDate.of(2022, 7, 1));
        period.setStartDateSource(HrEmploymentPeriod.SOURCE_MANUAL);
        period.setStatus(HrEmploymentPeriod.STATUS_ACTIVE);
        when(employmentPeriodService.listByUsers(anyCollection())).thenReturn(Map.of(USER_ID, List.of(period)));

        EmployeeVO vo = service.roster(1, 10, null, null, null, null, null, null, null, null, null, null)
                .getRecords().get(0);

        assertEquals(LocalDate.of(2022, 7, 1), vo.getHireDate());
        assertEquals(HrEmploymentPeriod.SOURCE_MANUAL, vo.getHireDateSource());
    }

    @Test
    @DisplayName("无入职锚点时标 UNVERIFIED，且不回填账号创建日")
    void missingAnchorIsReportedAsUnverified() {
        EmployeeVO vo = employee();
        // 账号创建日故意设成昨天：它绝不能被当成入职日填进未核实的行
        vo.setCreatedAt(LocalDateTime.now().minusDays(1));
        when(employeeService.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any())).thenReturn(new PageResult<>(List.of(vo), 1L));
        when(hrAssignmentQuery.asOfRecords(anyCollection(), any())).thenReturn(Map.of());
        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of(USER_ID, List.of(
                record(9L, TODAY.minusDays(30), HrOperationCode.PROMOTION, null))));

        EmployeeVO result = service.roster(1, 10, null, null, null, null, null, null, null, null, null, null)
                .getRecords().get(0);

        assertNull(result.getHireDate(), "缺锚点时不能给任何日期");
        assertEquals(HrEmploymentPeriod.SOURCE_UNVERIFIED, result.getHireDateSource());
    }

    @Test
    @DisplayName("没有转正事实时试用状态是 UNKNOWN，而不是「试用期」")
    void unknownProbationIsNotGuessed() {
        EmployeeVO vo = service.roster(1, 10, null, null, null, null, null, null, null, null, null, null)
                .getRecords().get(0);
        assertEquals(HrRosterQueryService.PROBATION_UNKNOWN, vo.getProbationStatus());

        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of(USER_ID, List.of(
                record(1L, TODAY.minusYears(1), HrOperationCode.REGULAR, null))));
        EmployeeVO regular = service.roster(1, 10, null, null, null, null, null, null, null, null, null, null)
                .getRecords().get(0);
        assertEquals(HrRosterQueryService.REGULAR, regular.getProbationStatus());
    }

    @Test
    @DisplayName("导出超上限直接拒绝，不返回被截断的「完整」文件")
    void exportRejectsWhenOverCap() {
        when(employeeService.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any())).thenReturn(new PageResult<>(
                List.of(employee()), EmployeeService.ROSTER_EXPORT_MAX_ROWS + 1L));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.rosterForExport(null, null, null, null, null, null, null, null, null, null));
        assertTrue(ex.getMessage().contains("匯出上限"), ex.getMessage());
    }

    @Test
    @DisplayName("范围为空集时不查富化数据（一条都不给）")
    void emptyScopeSkipsEnrichment() {
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(Set.of());
        when(employeeService.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0L));

        PageResult<EmployeeVO> result = service.roster(1, 10, null, null, null, null, null, null,
                null, null, null, null);

        assertEquals(0L, result.getTotal());
        verify(hrAssignmentQuery, never()).asOfRecords(anyCollection(), any());
    }

    // ── 夹具 ──

    private static EmployeeVO employee() {
        EmployeeVO vo = new EmployeeVO();
        vo.setId(USER_ID);
        vo.setEmpId("MF00041");
        vo.setName("陳小明");
        return vo;
    }

    private static EmpPositionRecord record(Long id, LocalDate date, String code, String company) {
        EmpPositionRecord record = new EmpPositionRecord();
        record.setId(id);
        record.setUserId(USER_ID);
        record.setEffectiveDate(date);
        record.setEffectiveSeq(0);
        record.setOperationCode(code);
        record.setOperation(HrOperationCode.CODE_TO_NAME.get(code));
        record.setCompany(company);
        record.setEmployeeCategory("正式員工");
        record.setWorkCity("珠海");
        record.setDirectSuperior("王上級");
        return record;
    }
}

package com.mftb.admin.service.impl;

import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.constant.HrProfileDiff;
import com.mftb.admin.dto.ProfileDiffItemVO;
import com.mftb.admin.dto.ProfileDiffReportVO;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.OrgScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 雇佣数据差异报告测试（方案 §7.1「迁移前先出差异清单」）。
 * <p>除了各类别要命中，还必须钉住两条「不该出现」的断言：
 * 数据一致时不许报警（否则报告全是噪声，HR 很快就不看了），
 * 以及系统服务账号不许被当成员工统计。
 */
class HrProfileDiffTest {

    private static final LocalDate AS_OF = LocalDate.of(2026, 10, 18);
    private static final long EMP_ID = 11L;

    private SysUserMapper sysUserMapper;
    private HrAssignmentQuery hrAssignmentQuery;
    private HrEmploymentPeriodService employmentPeriodService;
    private OrgScopeService orgScopeService;
    private HrProfileDiffServiceImpl service;

    @BeforeEach
    void setUp() {
        sysUserMapper = mock(SysUserMapper.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        employmentPeriodService = mock(HrEmploymentPeriodService.class);
        orgScopeService = mock(OrgScopeService.class);
        service = new HrProfileDiffServiceImpl(sysUserMapper, hrAssignmentQuery,
                employmentPeriodService, orgScopeService);

        // 默认：范围不限制、库里只有这一个员工、什么差异都没有
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(null);
        when(sysUserMapper.selectList(any())).thenReturn(List.of(employee()));
        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of(EMP_ID, List.of(
                record(1L, LocalDate.of(2024, 3, 1), HrOperationCode.ONBOARD),
                record(2L, LocalDate.of(2025, 5, 6), HrOperationCode.TRANSFER))));
        when(hrAssignmentQuery.asOfRecords(anyCollection(), any())).thenReturn(Map.of(EMP_ID,
                record(2L, LocalDate.of(2025, 5, 6), HrOperationCode.TRANSFER)));
        when(employmentPeriodService.listByUsers(anyCollection())).thenReturn(Map.of(EMP_ID, List.of(
                period(1, LocalDate.of(2024, 3, 1), HrEmploymentPeriod.STATUS_ACTIVE))));
    }

    @Test
    @DisplayName("三方一致时不产生任何差异行")
    void consistentDataProducesNoDiff() {
        ProfileDiffReportVO report = service.report(AS_OF);

        assertEquals(1, report.getScannedUsers());
        assertEquals(0, report.getDiffUsers(), "一致的数据不该报警: " + report.getItems());
        assertTrue(report.getItems().isEmpty());
    }

    @Test
    @DisplayName("账号快照部门与生效任职部门不符 → DEPT_MISMATCH，并把两边值都带出来")
    void snapshotDeptMismatch() {
        SysUser user = employee();
        user.setDepartment("营运中心");
        when(sysUserMapper.selectList(any())).thenReturn(List.of(user));

        ProfileDiffItemVO item = onlyItem();
        assertTrue(item.getCodes().contains(HrProfileDiff.DEPT_MISMATCH), item.getCodes().toString());
        assertEquals("营运中心", item.getSnapshotDept());
        assertEquals("市場部", item.getAsOfDept());
    }

    @Test
    @DisplayName("已离职但账号仍启用 → 最高严重度 ERROR")
    void resignedButAccountEnabled() {
        when(hrAssignmentQuery.asOfRecords(anyCollection(), any())).thenReturn(Map.of(EMP_ID,
                record(3L, LocalDate.of(2026, 9, 1), HrOperationCode.DIMISSION)));

        ProfileDiffItemVO item = onlyItem();
        assertTrue(item.getCodes().contains(HrProfileDiff.RESIGNED_ACCOUNT_ACTIVE), item.getCodes().toString());
        assertEquals(HrProfileDiff.SEVERITY_ERROR, item.getSeverity());
        assertEquals(HrAssignmentQuery.STATUS_RESIGNED, item.getEmploymentStatus());
    }

    @Test
    @DisplayName("可派生但雇佣期间未登记 → 计入可一键登记人数")
    void derivedButNotRegistered() {
        when(employmentPeriodService.listByUsers(anyCollection())).thenReturn(Map.of());

        ProfileDiffItemVO item = onlyItem();
        assertTrue(item.getCodes().contains(HrProfileDiff.PERIOD_NOT_REGISTERED), item.getCodes().toString());
        assertEquals(1, item.getDerivedPeriods());
        assertEquals(0, item.getRegisteredPeriods());
        assertEquals(1, service.report(AS_OF).getRegisterableUsers());
    }

    @Test
    @DisplayName("没有任何任职记录 → NO_POSITION_RECORD（在职状态无从派生）")
    void noPositionRecord() {
        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of());
        when(hrAssignmentQuery.asOfRecords(anyCollection(), any())).thenReturn(Map.of());
        when(employmentPeriodService.listByUsers(anyCollection())).thenReturn(Map.of());

        ProfileDiffItemVO item = onlyItem();
        assertTrue(item.getCodes().contains(HrProfileDiff.NO_POSITION_RECORD), item.getCodes().toString());
        assertFalse(item.getCodes().contains(HrProfileDiff.START_ANCHOR_MISSING),
                "无记录与有记录缺锚点是两件事，不能混成一类");
    }

    @Test
    @DisplayName("有异动但找不到入职锚点 → START_ANCHOR_MISSING，且不回填雇佣起点")
    void startAnchorMissing() {
        when(hrAssignmentQuery.historyOf(anyCollection())).thenReturn(Map.of(EMP_ID, List.of(
                record(2L, LocalDate.of(2025, 5, 6), HrOperationCode.TRANSFER))));

        ProfileDiffItemVO item = onlyItem();
        assertTrue(item.getCodes().contains(HrProfileDiff.START_ANCHOR_MISSING), item.getCodes().toString());
        assertNull(item.getEmploymentStart(), "缺锚点时不得给出起点");
        assertEquals(0, item.getDerivedPeriods());
    }

    @Test
    @DisplayName("范围收敛：可见集为空时一个人都不扫（持有菜单不等于能看全公司）")
    void emptyScopeScansNobody() {
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(Set.of());

        ProfileDiffReportVO report = service.report(AS_OF);
        assertEquals(0, report.getScannedUsers());
        assertEquals(0, report.getDiffUsers());
    }

    @Test
    @DisplayName("范围收敛：只扫可见的人")
    void scopeRestrictsCandidates() {
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(Set.of(999L));
        when(sysUserMapper.selectList(any())).thenReturn(List.of(user(999L, "MF99999", "陳小明")));

        ProfileDiffReportVO report = service.report(AS_OF);

        assertEquals(1, report.getScannedUsers());
        assertFalse(report.getItems().stream().anyMatch(i -> Long.valueOf(EMP_ID).equals(i.getUserId())),
                "范围外的人不许出现在报告里");
    }

    @Test
    @DisplayName("内置系统账号不计为员工")
    void systemAccountIsNotEmployee() {
        when(sysUserMapper.selectList(any())).thenReturn(List.of(
                user(2L, BuiltinAccounts.ADMIN_USERNAME, "系統管理員")));

        ProfileDiffReportVO report = service.report(AS_OF);

        assertEquals(0, report.getScannedUsers(), "服务账号不是员工，不该进人事差异清单");
    }

    // ── 夹具 ──

    private ProfileDiffItemVO onlyItem() {
        ProfileDiffReportVO report = service.report(AS_OF);
        assertEquals(1, report.getItems().size(), () -> "预期一条差异: " + report.getItems());
        return report.getItems().get(0);
    }

    private SysUser employee() {
        SysUser user = user(EMP_ID, "MF00011", "李大仁");
        user.setDepartment("市場部");
        user.setPosition("高級專員");
        user.setStatus(1);
        return user;
    }

    private SysUser user(Long id, String username, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername(username);
        user.setName(name);
        user.setEmpId(username);
        user.setStatus(1);
        return user;
    }

    private EmpPositionRecord record(Long id, LocalDate effectiveDate, String code) {
        EmpPositionRecord record = new EmpPositionRecord();
        record.setId(id);
        record.setUserId(EMP_ID);
        record.setEffectiveDate(effectiveDate);
        record.setEffectiveSeq(0);
        record.setOperationCode(code);
        record.setOperation(HrOperationCode.CODE_TO_NAME.get(code));
        record.setServiceDept("市場部");
        record.setPositionName("高級專員");
        record.setCompany("珠海閃蜂科技有限公司");
        return record;
    }

    private HrEmploymentPeriod period(int seq, LocalDate start, String status) {
        HrEmploymentPeriod period = new HrEmploymentPeriod();
        period.setId((long) seq);
        period.setUserId(EMP_ID);
        period.setPeriodSeq(seq);
        period.setStartDate(start);
        period.setStartDateSource(HrEmploymentPeriod.SOURCE_POSITION_RECORD);
        period.setStatus(status);
        return period;
    }
}

package com.mftb.admin.service.impl;

import com.mftb.admin.service.HrLeaveQueryAdapter;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AttDaySummary;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttMonthlySummary;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.mapper.AttDaySummaryMapper;
import com.mftb.admin.mapper.AttExceptionMapper;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttHolidayMapper;
import com.mftb.admin.mapper.AttMonthlySummaryMapper;
import com.mftb.admin.mapper.AttPunchLogMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AttendanceExceptionService;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 考勤域消费「组织数据范围」的回归测试（方案 §10.9 阶段一的验收面）。
 * <p>
 * 断言的是**真实落到查询条件里的范围过滤**与**按 id 单条读写的拒绝断言**，
 * 不是「方法被调用过」：只过滤列表的话，改一下 URL 里的 id 就绕过去了；
 * 只验证调用次数的话，条件写错也照样绿。
 */
class AttendanceScopeGuardTest {

    private static final long SELF_ID = 24L;
    private static final long OTHER_ID = 25L;
    private static final LocalDate WORK_DATE = LocalDate.of(2026, 10, 12);

    private OrgScopeService orgScopeService;

    private AttPunchLogMapper punchMapper;
    private SysUserMapper sysUserMapper;
    private AttGroupMapper groupMapper;
    private AttGroupMemberMapper memberMapper;
    private AttScheduleMapper scheduleMapper;
    private AttShiftMapper shiftMapper;
    private AttExceptionMapper exceptionMapper;
    private HrLeaveRequestMapper leaveMapper;
    private AttDaySummaryMapper dayMapper;
    private AttMonthlySummaryMapper monthlyMapper;
    private AttendancePunchServiceImpl punchService;
    private AttendanceExceptionServiceImpl exceptionService;
    private AttendanceSummaryServiceImpl summaryService;
    private AttendanceScheduleServiceImpl scheduleService;
    private AttendanceGroupServiceImpl groupService;

    @BeforeEach
    void setUp() {
        for (Class<?> entity : List.of(AttPunchLog.class, AttException.class, AttDaySummary.class,
                AttMonthlySummary.class, AttSchedule.class, AttGroupMember.class, AttGroup.class,
                AttShift.class, HrLeaveRequest.class, com.mftb.admin.entity.SysUser.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
        orgScopeService = mock(OrgScopeService.class);
        punchMapper = mock(AttPunchLogMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        groupMapper = mock(AttGroupMapper.class);
        memberMapper = mock(AttGroupMemberMapper.class);
        scheduleMapper = mock(AttScheduleMapper.class);
        shiftMapper = mock(AttShiftMapper.class);
        exceptionMapper = mock(AttExceptionMapper.class);
        leaveMapper = mock(HrLeaveRequestMapper.class);
        dayMapper = mock(AttDaySummaryMapper.class);
        monthlyMapper = mock(AttMonthlySummaryMapper.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");

        punchService = new AttendancePunchServiceImpl(punchMapper, sysUserMapper, groupMapper, memberMapper,
                scheduleMapper, shiftMapper, operatorResolver, orgScopeService);
        AttendanceSummaryService summaryMock = mock(AttendanceSummaryService.class);
        exceptionService = new AttendanceExceptionServiceImpl(exceptionMapper, new HrLeaveQueryAdapter(leaveMapper),
                mock(AttendancePunchService.class), summaryMock, operatorResolver, orgScopeService);
        summaryService = new AttendanceSummaryServiceImpl(groupMapper, memberMapper, scheduleMapper, shiftMapper,
                punchMapper, exceptionMapper, dayMapper, monthlyMapper, mock(AttHolidayMapper.class), new HrLeaveQueryAdapter(leaveMapper),
                mock(BizSeqService.class), operatorResolver, mock(SysConfigService.class), orgScopeService);
        scheduleService = new AttendanceScheduleServiceImpl(groupMapper, memberMapper, scheduleMapper,
                shiftMapper, operatorResolver, orgScopeService);
        groupService = new AttendanceGroupServiceImpl(groupMapper, memberMapper, shiftMapper, scheduleMapper,
                sysUserMapper, mock(BizSeqService.class), operatorResolver, orgScopeService);
    }

    /* ==================== 夹具 ==================== */

    /** 受限范围：只看自己 */
    private void restrictedToSelf() {
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(Set.of(SELF_ID));
        when(orgScopeService.resolveVisibleDeptIds()).thenReturn(Set.of());
    }

    private static AttException exception(long id, Long userId) {
        AttException row = new AttException();
        row.setId(id);
        row.setUserId(userId);
        row.setEmpNo("MF00024");
        row.setWorkDate(WORK_DATE);
        row.setExceptionType(AttException.TYPE_ABSENT);
        row.setStatus(AttException.STATUS_PENDING);
        return row;
    }

    private static AttMonthlySummary monthly(long id, Long userId, String status) {
        AttMonthlySummary row = new AttMonthlySummary();
        row.setId(id);
        row.setUserId(userId);
        row.setStatMonth("2026-09");
        row.setStatus(status);
        return row;
    }

    /** 捕获 mapper 收到的查询条件，转成 SQL 片段用于断言 */
    @SuppressWarnings("unchecked")
    private static String sqlOf(Object capturedWrapper) {
        return ((LambdaQueryWrapper<Object>) capturedWrapper).getSqlSegment();
    }

    /* ==================== 查询侧：条件必须带范围 ==================== */

    @Test
    @DisplayName("打卡列表把可见人员下推为 user_id 条件")
    void punchListPushesUserScope() {
        restrictedToSelf();
        when(punchMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));

        punchService.page(1, 10, WORK_DATE, WORK_DATE, null, null, null, null, null, null, null);

        ArgumentCaptor<LambdaQueryWrapper<AttPunchLog>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(punchMapper).selectPage(any(Page.class), captor.capture());
        assertTrue(sqlOf(captor.getValue()).contains("user_id"), "打卡列表未下推人员范围: " + sqlOf(captor.getValue()));
    }

    @Test
    @DisplayName("打卡统计卡与列表同口径（不得单独发无条件计数）")
    void punchStatsShareListScope() {
        restrictedToSelf();
        when(punchMapper.selectList(any())).thenReturn(List.of());

        punchService.stats(WORK_DATE, WORK_DATE, null, null, null, null, null);

        ArgumentCaptor<LambdaQueryWrapper<AttPunchLog>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(punchMapper).selectList(captor.capture());
        assertTrue(sqlOf(captor.getValue()).contains("user_id"), "统计卡未下推人员范围: " + sqlOf(captor.getValue()));
    }

    @Test
    @DisplayName("异常列表与待办计数都带人员范围")
    void exceptionListAndPendingCountAreScoped() {
        restrictedToSelf();
        when(exceptionMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));
        when(exceptionMapper.selectCount(any())).thenReturn(0L);

        exceptionService.page(1, 10, WORK_DATE, WORK_DATE, null, null, null, null, null, null);
        exceptionService.pendingCount(WORK_DATE, WORK_DATE);

        ArgumentCaptor<LambdaQueryWrapper<AttException>> pageCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(exceptionMapper).selectPage(any(Page.class), pageCaptor.capture());
        assertTrue(sqlOf(pageCaptor.getValue()).contains("user_id"), "异常列表未下推人员范围");

        ArgumentCaptor<LambdaQueryWrapper<AttException>> countCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(exceptionMapper).selectCount(countCaptor.capture());
        assertTrue(sqlOf(countCaptor.getValue()).contains("user_id"), "待办计数未下推人员范围");
    }

    @Test
    @DisplayName("日报按可见部门收敛，月报按可见人员收敛")
    void summariesUseDeptScopeForRollupAndUserScopeForMonthly() {
        restrictedToSelf();
        when(dayMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));
        when(monthlyMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));

        summaryService.dailyPage(1, 10, WORK_DATE, WORK_DATE, null, null, null, null);
        summaryService.monthlyPage(1, 10, "2026-09", null, null, null, null, null, null);

        ArgumentCaptor<LambdaQueryWrapper<AttDaySummary>> dayCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(dayMapper).selectPage(any(Page.class), dayCaptor.capture());
        assertTrue(sqlOf(dayCaptor.getValue()).contains("dept_id"), "日报未下推部门范围: " + sqlOf(dayCaptor.getValue()));

        ArgumentCaptor<LambdaQueryWrapper<AttMonthlySummary>> monthCaptor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(monthlyMapper).selectPage(any(Page.class), monthCaptor.capture());
        assertTrue(sqlOf(monthCaptor.getValue()).contains("user_id"), "月报未下推人员范围");
    }

    @Test
    @DisplayName("班表成员行与考勤组成员清单都带人员范围")
    void scheduleGridAndGroupMembersAreScoped() {
        restrictedToSelf();
        AttGroup group = new AttGroup();
        group.setId(1L);
        group.setGroupName("門店考勤組");
        when(groupMapper.selectById(1L)).thenReturn(group);
        when(memberMapper.selectList(any())).thenReturn(List.of());
        when(scheduleMapper.selectList(any())).thenReturn(List.of());
        when(memberMapper.selectCount(any())).thenReturn(0L);

        scheduleService.week(1L, WORK_DATE);
        groupService.currentMembers(1L);

        ArgumentCaptor<LambdaQueryWrapper<AttGroupMember>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(memberMapper, org.mockito.Mockito.atLeast(2)).selectList(captor.capture());
        assertTrue(captor.getAllValues().stream()
                        .allMatch(w -> sqlOf(w).contains("user_id")),
                "班表/成员清单必须都按可见人员收敛");
    }

    /* ==================== 写侧：按 id 单条必须二次校验 ==================== */

    @Test
    @DisplayName("查看范围外人员的考勤异常：必须抛越权")
    void exceptionDetailRejectsOutOfScopeUser() {
        AttException row = exception(11L, OTHER_ID);
        when(exceptionMapper.selectById(11L)).thenReturn(row);
        doThrow(new BusinessException("無權查看該人員的資料")).when(orgScopeService).requireVisibleUser(OTHER_ID);

        assertThrows(BusinessException.class, () -> exceptionService.detail(11L));
    }

    @Test
    @DisplayName("补录打卡（reissue）走同一个归属校验：改 URL 里的异常 id 绕不过去")
    void reissueRejectsOutOfScopeUser() {
        when(exceptionMapper.selectById(11L)).thenReturn(exception(11L, OTHER_ID));
        doThrow(new BusinessException("無權查看該人員的資料")).when(orgScopeService).requireVisibleUser(OTHER_ID);

        assertThrows(BusinessException.class, () -> exceptionService.reissue(11L,
                WORK_DATE.atTime(9, 0), WORK_DATE.atTime(18, 0), "忘記打卡"));
        // 越权后不能落任何结论：异常行不更新，也不写回写日志
        verify(exceptionMapper, org.mockito.Mockito.never()).updateById(any(AttException.class));
    }

    @Test
    @DisplayName("批量确认含范围外人员：整批拒绝，不静默少确认")
    void confirmRejectsWholeBatchWhenAnyRowOutOfScope() {
        when(exceptionMapper.selectBatchIds(any())).thenReturn(List.of(exception(11L, SELF_ID), exception(12L, OTHER_ID)));
        doThrow(new BusinessException("無權查看該人員的資料")).when(orgScopeService).requireVisibleUser(OTHER_ID);

        assertThrows(BusinessException.class, () -> exceptionService.confirm(List.of(11L, 12L), "屬實"));
        verify(exceptionMapper, org.mockito.Mockito.never()).updateById(any(AttException.class));
    }

    @Test
    @DisplayName("冻结/同步月报：范围外人员的行一律拒绝，防止把别人结论送进薪酬")
    void freezeAndSyncRejectOutOfScopeRows() {
        doThrow(new BusinessException("無權查看該人員的資料")).when(orgScopeService).requireVisibleUser(OTHER_ID);
        // 冻结只对 draft 行进入归属校验（状态不符先行跳过，这是幂等语义），同步同理只对 frozen 行
        when(monthlyMapper.selectById(7L)).thenReturn(monthly(7L, OTHER_ID, AttMonthlySummary.STATUS_DRAFT));
        assertThrows(BusinessException.class, () -> summaryService.freeze(List.of(7L)));

        when(monthlyMapper.selectById(8L))
                .thenReturn(monthly(8L, OTHER_ID, AttMonthlySummary.STATUS_FROZEN));
        assertThrows(BusinessException.class, () -> summaryService.syncToPayroll(List.of(8L)));
        verify(monthlyMapper, org.mockito.Mockito.never()).updateById(any(AttMonthlySummary.class));
    }

    @Test
    @DisplayName("排班保存与整周复制都校验目标人员在范围内")
    void scheduleWritesCheckTargetUser() {
        AttGroup group = new AttGroup();
        group.setId(1L);
        when(groupMapper.selectById(1L)).thenReturn(group);
        doThrow(new BusinessException("無權查看該人員的資料")).when(orgScopeService).requireVisibleUser(anyLong());

        com.mftb.admin.dto.AttendanceScheduleSaveRequest request =
                new com.mftb.admin.dto.AttendanceScheduleSaveRequest();
        request.setGroupId(1L);
        com.mftb.admin.dto.AttendanceScheduleSaveRequest.Entry entry =
                new com.mftb.admin.dto.AttendanceScheduleSaveRequest.Entry();
        entry.setUserId(OTHER_ID);
        entry.setWorkDate(WORK_DATE);
        request.setEntries(List.of(entry));

        assertThrows(BusinessException.class, () -> scheduleService.save(request));
    }

    @Test
    @DisplayName("受限角色手动触发钉钉同步：整组作业需全部范围，直接拒绝")
    void manualSyncRequiresUnrestrictedScope() {
        restrictedToSelf();

        assertThrows(BusinessException.class,
                () -> new AttendanceSyncServiceImpl(mock(com.mftb.admin.service.DingTalkAppService.class),
                        mock(SysConfigService.class), sysUserMapper, groupMapper, memberMapper,
                        mock(AttendancePunchService.class), orgScopeService)
                        .sync(WORK_DATE, WORK_DATE, null));
    }

    @Test
    @DisplayName("范围不限制（超管/定时任务）时同步不会被范围门槛拦下")
    void unrestrictedSyncIsNotBlocked() {
        when(orgScopeService.resolveVisibleUserIds()).thenReturn(null);
        AttendanceSyncServiceImpl sync = new AttendanceSyncServiceImpl(
                mock(com.mftb.admin.service.DingTalkAppService.class), mock(SysConfigService.class),
                sysUserMapper, groupMapper, memberMapper, mock(AttendancePunchService.class), orgScopeService);

        // 没配置钉钉应用 → 应停在「未配置」而不是「範圍不足」，证明后台/超管调用没被误伤
        BusinessException ex = assertThrows(BusinessException.class, () -> sync.sync(WORK_DATE, WORK_DATE, null));
        assertTrue(ex.getMessage().contains("釘釘"), "应该走到取应用配置那一步而不是被范围拦下: " + ex.getMessage());
    }
}

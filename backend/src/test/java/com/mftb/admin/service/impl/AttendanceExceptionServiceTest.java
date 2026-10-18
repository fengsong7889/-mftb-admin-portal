package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.mapper.AttExceptionMapper;
import com.mftb.admin.service.AttendanceExceptionService;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 考勤异常处理测试。
 * <p>
 * 钉住四条最容易被改坏的口径：只有待处理行能被推进（回调重放与重复点击不得覆盖审批结论）、
 * 已冻结月份拒绝回溯补卡、补录打卡必须带独立来源码、请假只抵扣缺勤类异常而不抹掉迟到。
 */
class AttendanceExceptionServiceTest {

    private static final LocalDate WORK_DATE = LocalDate.of(2026, 10, 8);

    @Mock
    private AttExceptionMapper exceptionMapper;
    @Mock
    private com.mftb.admin.mapper.HrLeaveRequestMapper leaveMapper;
    @Mock
    private AttendancePunchService punchService;
    @Mock
    private AttendanceSummaryService summaryService;
    @Mock
    private OperatorResolver operatorResolver;

    private AttendanceExceptionService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceExceptionServiceImpl(exceptionMapper, leaveMapper, punchService, summaryService,
                operatorResolver, org.mockito.Mockito.mock(com.mftb.admin.service.OrgScopeService.class));
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");
    }

    @Test
    @DisplayName("批量确认只推进待处理行，已处理行跳过并在结果里回报差额")
    void confirmOnlyTouchesPendingRows() {
        AttException pending = exception(11L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        AttException handled = exception(12L, AttException.TYPE_MISSING_CARD, AttException.STATUS_HANDLED);
        when(exceptionMapper.selectBatchIds(anyList())).thenReturn(List.of(pending, handled));

        Map<String, Object> result = service.confirm(List.of(11L, 12L), "當日外勤拜訪客戶");

        assertEquals(2, result.get("submitted"));
        assertEquals(1, result.get("affected"));
        assertEquals(1, result.get("skipped"), "已补卡的行不能被确认覆盖，否则审批结论丢失");
        assertEquals(AttException.STATUS_CONFIRMED, pending.getStatus());
        assertEquals(AttException.STATUS_HANDLED, handled.getStatus(), "已处理行原样不动");
        assertEquals("當日外勤拜訪客戶", pending.getHandleRemark(), "确认原因必须落库，否则事后无法解释为何不抵扣");
        assertTrue(pending.getDetail().startsWith("全日無打卡紀錄"),
                "判定明细是引擎写的事实，人工备注不得覆盖或追加进去");
        verify(exceptionMapper).updateById(pending);
        verify(exceptionMapper, never()).updateById(handled);
    }

    @Test
    @DisplayName("所选异常全部已处理时直接拒绝，而不是静默返回 0 条")
    void confirmRejectsWhenNothingPending() {
        when(exceptionMapper.selectBatchIds(anyList()))
                .thenReturn(List.of(exception(13L, AttException.TYPE_LATE, AttException.STATUS_CONFIRMED)));

        assertThrows(BusinessException.class, () -> service.confirm(List.of(13L), "重複確認"));
    }

    @Test
    @DisplayName("补卡写入独立来源码并触发当日重算，让日报立刻反映补齐的卡")
    void reissueWritesTraceablePunchAndRecalculates() {
        AttException row = exception(21L, AttException.TYPE_MISSING_CARD, AttException.STATUS_PENDING);
        row.setGroupId(7L);
        when(exceptionMapper.selectById(21L)).thenReturn(row);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);
        when(punchService.saveGenerated(anyList())).thenReturn(2);

        service.reissue(21L, WORK_DATE.atTime(9, 0), WORK_DATE.atTime(18, 30), "忘記打下班卡");

        ArgumentCaptor<List<AttPunchLog>> captor = ArgumentCaptor.forClass(List.class);
        verify(punchService).saveGenerated(captor.capture());
        List<AttPunchLog> logs = captor.getValue();
        assertEquals(2, logs.size());
        for (AttPunchLog log : logs) {
            assertEquals(AttPunchLog.SOURCE_REISSUE, log.getSource(), "补录必须与真实打卡可区分，否则审计链断裂");
            assertEquals("exception:21", log.getRawRef(), "每张补录卡都要能追溯到是哪条异常补的");
            assertEquals(7L, log.getGroupId());
        }
        assertEquals(AttPunchLog.TYPE_ON, logs.get(0).getPunchType());
        assertEquals(AttPunchLog.TYPE_OFF, logs.get(1).getPunchType());
        assertEquals(AttException.STATUS_HANDLED, row.getStatus());
        assertEquals("忘記打下班卡", row.getHandleRemark());
        verify(summaryService).recalculateDaily(WORK_DATE, WORK_DATE, 7L);
    }

    @Test
    @DisplayName("已冻结月份拒绝补卡：薪酬已按这份数据算过工资，回溯会造成两套数字")
    void reissueRejectsFrozenMonth() {
        when(exceptionMapper.selectById(22L))
                .thenReturn(exception(22L, AttException.TYPE_MISSING_CARD, AttException.STATUS_PENDING));
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(true);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.reissue(22L, WORK_DATE.atTime(9, 0), null, "補卡"));
        assertTrue(error.getMessage().contains("已凍結"));
        verify(punchService, never()).saveGenerated(anyList());
    }

    @Test
    @DisplayName("补卡时间必须落在考勤日期当天，跨天夜班只允许下班卡到次日凌晨")
    void reissueValidatesPunchDate() {
        AttException row = exception(23L, AttException.TYPE_MISSING_CARD, AttException.STATUS_PENDING);
        when(exceptionMapper.selectById(23L)).thenReturn(row);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);

        // 上班卡补到别的月份：绕过冻结检查的典型手法
        assertThrows(BusinessException.class,
                () -> service.reissue(23L, LocalDate.of(2026, 9, 30).atTime(9, 0), null, "補錯月份"));
        // 下班卡早于上班卡
        assertThrows(BusinessException.class,
                () -> service.reissue(23L, WORK_DATE.atTime(18, 0), WORK_DATE.atTime(9, 0), "時間顛倒"));
        // 下班卡落到次日凌晨是合法的（跨天夜班）
        when(punchService.saveGenerated(anyList())).thenReturn(2);
        service.reissue(23L, WORK_DATE.atTime(20, 0), WORK_DATE.plusDays(1).atTime(4, 0), "夜班跨天");
        verify(punchService).saveGenerated(anyList());
    }

    @Test
    @DisplayName("补卡原因必填，且已处理异常不能重复补卡")
    void reissueGuards() {
        AttException pending = exception(24L, AttException.TYPE_LATE, AttException.STATUS_PENDING);
        when(exceptionMapper.selectById(24L)).thenReturn(pending);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);
        assertThrows(BusinessException.class,
                () -> service.reissue(24L, WORK_DATE.atTime(9, 0), null, "  "),
                "原因是补录唯一的合规依据，不能为空");

        AttException handled = exception(25L, AttException.TYPE_LATE, AttException.STATUS_HANDLED);
        when(exceptionMapper.selectById(25L)).thenReturn(handled);
        assertThrows(BusinessException.class,
                () -> service.reissue(25L, WORK_DATE.atTime(9, 0), null, "再補一次"));
    }

    @Test
    @DisplayName("请假只抵扣缺卡与旷工，迟到早退与已处理行一律不动")
    void deductByLeaveOnlyClosesAbsentTypes() {
        AttException missing = exception(31L, AttException.TYPE_MISSING_CARD, AttException.STATUS_PENDING);
        AttException absent = exception(32L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        AttException late = exception(33L, AttException.TYPE_LATE, AttException.STATUS_PENDING);
        AttException confirmed = exception(34L, AttException.TYPE_ABSENT, AttException.STATUS_CONFIRMED);
        when(exceptionMapper.selectList(any())).thenReturn(List.of(missing, absent, late, confirmed));
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);

        int deducted = service.deductByLeave(101L, WORK_DATE, WORK_DATE.plusDays(1), "OA202610080001");

        assertEquals(2, deducted);
        assertEquals(AttException.STATUS_LEAVE, missing.getStatus());
        assertEquals(AttException.STATUS_LEAVE, absent.getStatus());
        assertEquals("OA202610080001", missing.getFlowNo(), "抵扣必须留下假单编号，事后才能对账");
        assertEquals(AttException.STATUS_PENDING, late.getStatus(), "请一天假不等于当天没迟到，迟到扣减不能被抹掉");
        assertEquals(AttException.STATUS_CONFIRMED, confirmed.getStatus(), "已确认行不得被第二条路径重复关闭");
    }

    @Test
    @DisplayName("请假抵扣跳过已冻结月份，只记警告不抛错：审批不能被考勤侧的账期挡住")
    void deductByLeaveSkipsFrozenMonth() {
        AttException frozen = exception(35L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        frozen.setWorkDate(LocalDate.of(2026, 9, 20));
        AttException open = exception(36L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        when(exceptionMapper.selectList(any())).thenReturn(List.of(frozen, open));
        when(summaryService.isMonthFrozen("2026-09")).thenReturn(true);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);

        assertEquals(1, service.deductByLeave(101L, LocalDate.of(2026, 9, 20), WORK_DATE, "OA202610080002"));
        assertEquals(AttException.STATUS_PENDING, frozen.getStatus());
        assertEquals(AttException.STATUS_LEAVE, open.getStatus());
    }

    @Test
    @DisplayName("流程回写只接受已補卡/已請假/已加班三种目标状态，防止把行退回待处理")
    void markHandledByFlowRejectsIllegalStatus() {
        assertThrows(BusinessException.class,
                () -> service.markHandledByFlow("OA1", AttException.STATUS_PENDING));
        assertThrows(BusinessException.class,
                () -> service.markHandledByFlow("OA1", AttException.STATUS_CONFIRMED));
        assertThrows(BusinessException.class, () -> service.markHandledByFlow("  ", AttException.STATUS_HANDLED));
        verify(exceptionMapper, never()).updateById(any(AttException.class));
    }

    @Test
    @DisplayName("流程回写按 flowNo 定位且只推进待处理行，回调重放不会二次改写")
    void markHandledByFlowIsIdempotent() {
        AttException row = exception(41L, AttException.TYPE_MISSING_CARD, AttException.STATUS_PENDING);
        when(exceptionMapper.selectList(any())).thenReturn(List.of(row));

        assertEquals(1, service.markHandledByFlow("OA202610080003", AttException.STATUS_OVERTIME));
        assertEquals(AttException.STATUS_OVERTIME, row.getStatus());
        verify(exceptionMapper).updateById(row);

        // 重放：查询条件带 status=pending，已推进的行不会再被选中
        when(exceptionMapper.selectList(any())).thenReturn(List.of());
        assertEquals(0, service.markHandledByFlow("OA202610080003", AttException.STATUS_OVERTIME));
    }

    @Test
    @DisplayName("处理说明超过列宽直接拒绝，不静默截断审计凭据")
    void rejectsOverlongRemark() {
        when(exceptionMapper.selectBatchIds(anyList())).thenReturn(List.of(
                exception(26L, AttException.TYPE_LATE, AttException.STATUS_PENDING)));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.confirm(List.of(26L), "長".repeat(201)));
        assertTrue(error.getMessage().contains("200"), "必须告知上限，否则用户只能猜要删多少字");
        verify(exceptionMapper, never()).updateById(any(AttException.class));
    }

    @Test
    @DisplayName("关联假单抵扣：已核准 + 同一人 + 区间覆盖才放行，并重算当日")
    void deductByLeaveRequestValidatesAllFourConditions() {
        AttException row = exception(51L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        row.setGroupId(7L);
        when(exceptionMapper.selectById(51L)).thenReturn(row);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);
        when(leaveMapper.selectById(88L)).thenReturn(leave(88L, 101L,
                WORK_DATE.minusDays(1), WORK_DATE.plusDays(1), "approved"));

        service.deductByLeaveRequest(51L, 88L);

        assertEquals(AttException.STATUS_LEAVE, row.getStatus());
        assertEquals("OA202610080001", row.getFlowNo(), "抵扣必须留下假单流程号，事后才能对账");
        assertTrue(row.getHandleRemark().contains("LR20261008"), "处理说明要写清关联了哪张假单");
        verify(summaryService).recalculateDaily(WORK_DATE, WORK_DATE, 7L);
    }

    @Test
    @DisplayName("假单抵扣的四道闸门：未核准 / 不是同一人 / 区间不覆盖 / 迟到早退均拒绝")
    void deductByLeaveRequestRejectsInvalidCases() {
        AttException absent = exception(52L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        when(exceptionMapper.selectById(52L)).thenReturn(absent);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(false);

        // ① 假单还在审批中
        when(leaveMapper.selectById(1L)).thenReturn(leave(1L, 101L, WORK_DATE, WORK_DATE, "pending"));
        assertThrows(BusinessException.class, () -> service.deductByLeaveRequest(52L, 1L));

        // ② 假单属于别人：否则可以用同事的假单抹自己的旷工
        when(leaveMapper.selectById(2L)).thenReturn(leave(2L, 999L, WORK_DATE, WORK_DATE, "approved"));
        assertThrows(BusinessException.class, () -> service.deductByLeaveRequest(52L, 2L));

        // ③ 区间不覆盖该考勤日：否则可以用上个月的假单抵扣今天的缺卡
        when(leaveMapper.selectById(3L)).thenReturn(leave(3L, 101L,
                WORK_DATE.minusMonths(1), WORK_DATE.minusDays(3), "approved"));
        assertThrows(BusinessException.class, () -> service.deductByLeaveRequest(52L, 3L));

        // ④ 迟到不能用假单抵扣
        AttException late = exception(53L, AttException.TYPE_LATE, AttException.STATUS_PENDING);
        when(exceptionMapper.selectById(53L)).thenReturn(late);
        when(leaveMapper.selectById(4L)).thenReturn(leave(4L, 101L, WORK_DATE, WORK_DATE, "approved"));
        assertThrows(BusinessException.class, () -> service.deductByLeaveRequest(53L, 4L));

        verify(exceptionMapper, never()).updateById(any(AttException.class));
        verify(summaryService, never()).recalculateDaily(any(), any(), any());
    }

    @Test
    @DisplayName("已冻结月份与已处理异常均拒绝关联假单")
    void deductByLeaveRequestRespectsFrozenAndHandled() {
        AttException pending = exception(54L, AttException.TYPE_ABSENT, AttException.STATUS_PENDING);
        when(exceptionMapper.selectById(54L)).thenReturn(pending);
        when(summaryService.isMonthFrozen("2026-10")).thenReturn(true);
        assertThrows(BusinessException.class, () -> service.deductByLeaveRequest(54L, 88L));

        AttException handled = exception(55L, AttException.TYPE_ABSENT, AttException.STATUS_HANDLED);
        when(exceptionMapper.selectById(55L)).thenReturn(handled);
        assertThrows(BusinessException.class, () -> service.deductByLeaveRequest(55L, 88L));
        verify(exceptionMapper, never()).updateById(any(AttException.class));
    }

    private com.mftb.admin.entity.HrLeaveRequest leave(Long id, Long userId, java.time.LocalDate from,
                                                        java.time.LocalDate to, String status) {
        com.mftb.admin.entity.HrLeaveRequest leave = new com.mftb.admin.entity.HrLeaveRequest();
        leave.setId(id);
        leave.setReqNo("LR20261008");
        leave.setUserId(userId);
        leave.setStartDate(from);
        leave.setEndDate(to);
        leave.setStatus(status);
        leave.setFlowNo("OA202610080001");
        return leave;
    }

    private AttException exception(Long id, int type, int status) {
        AttException row = new AttException();
        row.setId(id);
        row.setUserId(101L);
        row.setEmpNo("MF00123");
        row.setEmpName("李大偉");
        row.setGroupId(7L);
        row.setWorkDate(WORK_DATE);
        row.setExceptionType(type);
        row.setDetail(type == AttException.TYPE_LATE ? "遲到 23 分鐘" : "全日無打卡紀錄且無有效假單");
        row.setStatus(status);
        return row;
    }
}

package com.mftb.admin.service.impl;

import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.service.AttendanceCallbackService;
import com.mftb.admin.service.AttendanceExceptionService;
import com.mftb.admin.service.AttendanceSummaryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 请假审批 → 考勤抵扣回调测试。
 * <p>
 * 这条链路最容易被改坏的地方是「抵扣了异常但没重算日报」：异常列表显示已请假，
 * 日报却仍算旷工，薪酬按日报取数就会错扣。这里把抵扣与重算的绑定关系钉住，
 * 并锁住长假不拖垮审批事务的上限。
 */
class AttendanceCallbackServiceTest {

    @Mock
    private HrLeaveRequestMapper leaveMapper;
    @Mock
    private AttendanceExceptionService exceptionService;
    @Mock
    private AttendanceSummaryService summaryService;

    private AttendanceCallbackService callback;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        callback = new AttendanceCallbackServiceImpl(leaveMapper, exceptionService, summaryService);
    }

    @Test
    @DisplayName("请假通过后按假单区间抵扣异常，并立刻重算同区间日报")
    void deductsAndRecalculatesForApprovedLeave() {
        when(leaveMapper.selectList(any())).thenReturn(List.of(
                leave(101L, LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 9))));
        when(exceptionService.deductByLeave(anyLong(), any(), any(), any())).thenReturn(2);

        callback.onLeaveApproved("OA202610080001");

        verify(exceptionService).deductByLeave(101L, LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 9),
                "OA202610080001");
        verify(summaryService).recalculateDaily(LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 9), null);
    }

    @Test
    @DisplayName("没有异常可抵扣时不触发重算：审批回调不该为无关日期跑一遍全组计算")
    void skipsRecalculateWhenNothingDeducted() {
        when(leaveMapper.selectList(any())).thenReturn(List.of(
                leave(101L, LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 8))));
        when(exceptionService.deductByLeave(anyLong(), any(), any(), any())).thenReturn(0);

        callback.onLeaveApproved("OA202610080002");

        verify(summaryService, never()).recalculateDaily(any(), any(), any());
    }

    @Test
    @DisplayName("长假只抵扣不自动重算，避免把审批事务拖到超时")
    void longLeaveDeductsWithoutAutoRecalculate() {
        when(leaveMapper.selectList(any())).thenReturn(List.of(
                leave(101L, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 30))));
        when(exceptionService.deductByLeave(anyLong(), any(), any(), any())).thenReturn(5);

        callback.onLeaveApproved("OA202607010003");

        verify(exceptionService).deductByLeave(eq(101L), any(), any(), eq("OA202607010003"));
        verify(summaryService, never()).recalculateDaily(any(), any(), any());
    }

    @Test
    @DisplayName("OA 中心直接发起的通用请假（无绑定假单）与非法区间都安全跳过")
    void ignoresUnboundOrInvalidLeave() {
        when(leaveMapper.selectList(any())).thenReturn(List.of());
        callback.onLeaveApproved("OA202610080004");

        HrLeaveRequest reversed = leave(101L, LocalDate.of(2026, 10, 9), LocalDate.of(2026, 10, 8));
        when(leaveMapper.selectList(any())).thenReturn(List.of(reversed));
        callback.onLeaveApproved("OA202610080005");

        callback.onLeaveApproved("  ");

        verify(exceptionService, never()).deductByLeave(anyLong(), any(), any(), any());
        verify(summaryService, never()).recalculateDaily(any(), any(), any());
    }

    private HrLeaveRequest leave(Long userId, LocalDate from, LocalDate to) {
        HrLeaveRequest request = new HrLeaveRequest();
        request.setId(55L);
        request.setUserId(userId);
        request.setEmpNo("MF00123");
        request.setStartDate(from);
        request.setEndDate(to);
        request.setStatus("approved");
        request.setFlowNo("OA202610080001");
        return request;
    }
}

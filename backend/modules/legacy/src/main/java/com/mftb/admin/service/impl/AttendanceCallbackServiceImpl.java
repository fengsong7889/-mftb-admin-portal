package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.contracts.hr.HrLeaveQueryPort;
import com.mftb.admin.service.AttendanceCallbackService;
import com.mftb.admin.service.AttendanceExceptionService;
import com.mftb.admin.service.AttendanceSummaryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 考勤域 OA 回调实现（独立事务：抵扣失败只回滚本回调，不影响审批状态落库）。
 * <p>
 * 必须在 {@code HrLeaveCallbackService.onFlowApproved} 之后调用——那一步才把假单置为
 * {@code approved}，而日汇总计算引擎只认 approved/completed 的假单，顺序颠倒会导致
 * 重算时看不到这张假单，抵扣了异常却仍算旷工。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceCallbackServiceImpl implements AttendanceCallbackService {

    /**
     * 自动重算的请假天数上限。
     * <p>重算是「区间天数 × 启用中考勤组数」的循环，长假（如产假半年）放进审批事务里
     * 会把连接占用到超时；超过上限只抵扣异常，日报留给夜间任务或管理员手动重算。
     */
    private static final int MAX_AUTO_RECALCULATE_DAYS = 31;

    private final HrLeaveQueryPort leaveQueryPort;
    private final AttendanceExceptionService exceptionService;
    private final AttendanceSummaryService summaryService;

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onLeaveApproved(String flowNo) {
        HrLeaveQueryPort.LeaveView leave = findByFlowNo(flowNo);
        if (leave == null || leave.userId() == null) {
            // OA 中心直接发起的通用请假（未关联请假单据）：没有区间可抵扣
            return;
        }
        LocalDate from = leave.startDate();
        LocalDate to = leave.endDate();
        if (from == null || to == null || from.isAfter(to)) {
            log.warn("請假單區間不合法，跳過考勤抵扣: flowNo={}", flowNo);
            return;
        }

        int deducted = exceptionService.deductByLeave(leave.userId(), from, to, flowNo);
        if (deducted == 0) {
            return;
        }

        long span = ChronoUnit.DAYS.between(from, to) + 1;
        if (span > MAX_AUTO_RECALCULATE_DAYS) {
            log.info("請假區間 {} 天超過自動重算上限，只抵扣異常，日報待夜間任務重算: flowNo={}", span, flowNo);
            return;
        }
        // 重算让日报的「請假人次 / 曠工」立刻反映这张假单；已冻结月份由重算内部整体跳过
        summaryService.recalculateDaily(from, to, null);
        log.info("請假審批已抵扣考勤異常並重算日報: flowNo={}, 員工ID={}, 區間={}~{}, 抵扣={} 條",
                flowNo, leave.userId(), from, to, deducted);
    }

    private HrLeaveQueryPort.LeaveView findByFlowNo(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        return leaveQueryPort.findByFlowNo(flowNo).orElse(null);
    }
}

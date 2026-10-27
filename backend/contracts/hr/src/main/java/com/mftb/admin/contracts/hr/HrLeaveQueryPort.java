package com.mftb.admin.contracts.hr;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 请假单只读投影：考勤（attendance）抵扣异常与算日报时使用。
 *
 * 为什么要有：考勤原先直接注入 HrLeaveRequestMapper 并复制「同人 + 区间覆盖 + 状态」三组条件，
 * HR 调整口径时考勤会静默不同步。状态集合仍由考勤传入（哪些状态可抵扣是考勤的业务决定），
 * 但查询不变量留在 HR 侧实现。
 *
 * 依赖方向：legacy -&gt; contracts/hr &lt;- modules/hr。
 */
public interface HrLeaveQueryPort {

    Optional<LeaveView> findById(Long leaveId);

    Optional<LeaveView> findByFlowNo(String flowNo);

    List<LeaveView> listEffectiveForUser(Long userId, LocalDate date, Collection<String> statuses);

    List<LeaveView> listEffectiveForUsers(Collection<Long> userIds, LocalDate date, Collection<String> statuses);

    Set<Long> userIdsWithEffectiveLeave(Collection<Long> userIds, LocalDate date, Collection<String> statuses);

    /** 请假单只读投影（考勤页面与抵扣日志用到的字段） */
    record LeaveView(Long id, String flowNo, String reqNo, Long userId, String status,
                     LocalDate startDate, LocalDate endDate, String leaveType, BigDecimal days) {
    }
}

package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.contracts.hr.HrLeaveQueryPort;
import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 请假单只读契约的 HR 侧实现：考勤通过 HrLeaveQueryPort 读取。
 * 「区间覆盖（start <= date <= end）」与「同人」不变量留在域内；状态集合由考勤传入。
 */
@Service
@RequiredArgsConstructor
public class HrLeaveQueryAdapter implements HrLeaveQueryPort {

    private final HrLeaveRequestMapper leaveMapper;

    @Override
    public Optional<LeaveView> findById(Long leaveId) {
        return leaveId == null ? Optional.empty()
                : Optional.ofNullable(leaveMapper.selectById(leaveId)).map(this::toView);
    }

    @Override
    public Optional<LeaveView> findByFlowNo(String flowNo) {
        if (flowNo == null || flowNo.isBlank()) {
            return Optional.empty();
        }
        List<HrLeaveRequest> list = leaveMapper.selectList(
                new LambdaQueryWrapper<HrLeaveRequest>().eq(HrLeaveRequest::getFlowNo, flowNo));
        return list.isEmpty() ? Optional.empty() : Optional.of(toView(list.get(0)));
    }

    @Override
    public List<LeaveView> listEffectiveForUser(Long userId, LocalDate date, Collection<String> statuses) {
        if (userId == null || date == null || statuses == null || statuses.isEmpty()) {
            return List.of();
        }
        return leaveMapper.selectList(new LambdaQueryWrapper<HrLeaveRequest>()
                        .eq(HrLeaveRequest::getUserId, userId)
                        .le(HrLeaveRequest::getStartDate, date)
                        .ge(HrLeaveRequest::getEndDate, date)
                        .in(HrLeaveRequest::getStatus, statuses))
                .stream().map(this::toView).toList();
    }

    @Override
    public List<LeaveView> listEffectiveForUsers(Collection<Long> userIds, LocalDate date, Collection<String> statuses) {
        if (userIds == null || userIds.isEmpty() || date == null || statuses == null || statuses.isEmpty()) {
            return List.of();
        }
        return leaveMapper.selectList(new LambdaQueryWrapper<HrLeaveRequest>()
                        .in(HrLeaveRequest::getUserId, userIds)
                        .le(HrLeaveRequest::getStartDate, date)
                        .ge(HrLeaveRequest::getEndDate, date)
                        .in(HrLeaveRequest::getStatus, statuses))
                .stream().map(this::toView).toList();
    }

    @Override
    public Set<Long> userIdsWithEffectiveLeave(Collection<Long> userIds, LocalDate date, Collection<String> statuses) {
        return listEffectiveForUsers(userIds, date, statuses).stream()
                .map(LeaveView::userId).filter(Objects::nonNull).collect(Collectors.toSet());
    }

    private LeaveView toView(HrLeaveRequest leave) {
        return new LeaveView(leave.getId(), leave.getFlowNo(), leave.getReqNo(), leave.getUserId(),
                leave.getStatus(), leave.getStartDate(), leave.getEndDate(), leave.getLeaveType(), leave.getDays());
    }
}

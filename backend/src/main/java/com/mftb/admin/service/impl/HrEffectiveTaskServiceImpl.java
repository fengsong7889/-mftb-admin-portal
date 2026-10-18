package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.HrEffectiveTask;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.mapper.HrEffectiveTaskMapper;
import com.mftb.admin.service.HrEffectiveTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 待生效任务实现（直接走 Mapper，不引消息中间件：方案 §7.4 明确首期用轻量任务表）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrEffectiveTaskServiceImpl implements HrEffectiveTaskService {

    /** last_error 列长度上限，超长截断而不是让整条登记失败 */
    private static final int MAX_ERROR_LENGTH = 480;

    private final HrEffectiveTaskMapper taskMapper;

    @Override
    public void schedule(HrLifecycleRequest request, LocalDate effectiveDate, String operator) {
        HrEffectiveTask existing = findByRequest(request.getId());
        if (existing == null) {
            HrEffectiveTask task = new HrEffectiveTask();
            task.setRequestId(request.getId());
            task.setReqNo(request.getReqNo());
            task.setRequestType(request.getType());
            task.setUserId(request.getUserId());
            task.setEffectiveDate(effectiveDate);
            task.setStatus(HrEffectiveTask.STATUS_PENDING);
            task.setAttempts(0);
            task.setCreatedBy(operator);
            task.setUpdatedBy(operator);
            taskMapper.insert(task);
            log.info("HR 待生效任务已登记: reqNo={}, effectiveDate={}", request.getReqNo(), effectiveDate);
            return;
        }
        // 复用同一行而不是删后再插：保留 attempts 与历史 last_error，排查时能看出「这是第几次改期」
        existing.setEffectiveDate(effectiveDate);
        existing.setStatus(HrEffectiveTask.STATUS_PENDING);
        existing.setUserId(request.getUserId());
        existing.setReqNo(request.getReqNo());
        existing.setRequestType(request.getType());
        existing.setUpdatedBy(operator);
        existing.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(existing);
        log.info("HR 待生效任务已更新: reqNo={}, effectiveDate={}", request.getReqNo(), effectiveDate);
    }

    @Override
    public List<HrEffectiveTask> dueTasks(LocalDate today, int limit) {
        LocalDate day = today == null ? LocalDate.now() : today;
        return taskMapper.selectList(new LambdaQueryWrapper<HrEffectiveTask>()
                        .eq(HrEffectiveTask::getStatus, HrEffectiveTask.STATUS_PENDING)
                        .le(HrEffectiveTask::getEffectiveDate, day)
                        .orderByAsc(HrEffectiveTask::getEffectiveDate)
                        .orderByAsc(HrEffectiveTask::getId))
                .stream().limit(Math.max(1, limit)).toList();
    }

    @Override
    public void markDone(Long requestId, String operator) {
        HrEffectiveTask task = findByRequest(requestId);
        if (task == null) {
            return;
        }
        task.setStatus(HrEffectiveTask.STATUS_DONE);
        task.setExecutedAt(LocalDateTime.now());
        task.setLastError(null);
        task.setUpdatedBy(operator);
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        log.info("HR 待生效任务执行完成: reqNo={}", task.getReqNo());
    }

    @Override
    public void markFailed(Long requestId, HrLifecycleRequest request, String error, String operator) {
        HrEffectiveTask task = findByRequest(requestId);
        if (task == null) {
            // 立即生效的单据失败时也要建任务行，否则「办理失败」只存在于单据 remark 里，
            // 既进不了待办清单也没法在界面上重试。
            task = new HrEffectiveTask();
            task.setRequestId(requestId);
            task.setReqNo(request == null ? null : request.getReqNo());
            task.setRequestType(request == null ? null : request.getType());
            task.setUserId(request == null ? null : request.getUserId());
            task.setEffectiveDate(request == null ? LocalDate.now() : effectiveOf(request));
            task.setStatus(HrEffectiveTask.STATUS_PENDING);
            task.setAttempts(0);
            task.setCreatedBy(operator);
            taskMapper.insert(task);
        }
        task.setStatus(HrEffectiveTask.STATUS_FAILED);
        task.setAttempts((task.getAttempts() == null ? 0 : task.getAttempts()) + 1);
        task.setLastError(truncate(error));
        task.setUpdatedBy(operator);
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        log.warn("HR 待生效任务执行失败: reqNo={}, attempts={}, error={}",
                task.getReqNo(), task.getAttempts(), task.getLastError());
    }

    @Override
    public void cancel(Long requestId, String operator) {
        HrEffectiveTask task = findByRequest(requestId);
        if (task == null || HrEffectiveTask.STATUS_DONE.equals(task.getStatus())) {
            // 已执行完成的任务不回收：撤销不能倒回已经生效的任职事实，只能走更正流程
            return;
        }
        task.setStatus(HrEffectiveTask.STATUS_CANCELLED);
        task.setUpdatedBy(operator);
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        log.info("HR 待生效任务已作废: reqNo={}", task.getReqNo());
    }

    @Override
    public Optional<HrEffectiveTask> ofRequest(Long requestId) {
        return Optional.ofNullable(findByRequest(requestId));
    }

    @Override
    public java.util.Map<Long, HrEffectiveTask> ofRequests(java.util.Collection<Long> requestIds) {
        java.util.Map<Long, HrEffectiveTask> result = new java.util.HashMap<>();
        if (requestIds == null || requestIds.isEmpty()) {
            return result;
        }
        java.util.Set<Long> ids = requestIds.stream()
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        if (ids.isEmpty()) {
            return result;
        }
        // 同一单据历史上可能有多行（失败后重新登记前复用行，理论上只一行）：取 id 最大的一条
        for (HrEffectiveTask task : taskMapper.selectList(new LambdaQueryWrapper<HrEffectiveTask>()
                .in(HrEffectiveTask::getRequestId, ids)
                .orderByAsc(HrEffectiveTask::getId))) {
            result.put(task.getRequestId(), task);
        }
        return result;
    }

    private HrEffectiveTask findByRequest(Long requestId) {
        if (requestId == null) {
            return null;
        }
        return taskMapper.selectOne(new LambdaQueryWrapper<HrEffectiveTask>()
                .eq(HrEffectiveTask::getRequestId, requestId)
                .orderByDesc(HrEffectiveTask::getId)
                .last("LIMIT 1"));
    }

    private LocalDate effectiveOf(HrLifecycleRequest request) {
        if (request.getEffectiveDate() != null) {
            return request.getEffectiveDate();
        }
        if (request.getLastWorkDate() != null) {
            return request.getLastWorkDate();
        }
        return LocalDate.now();
    }

    private static String truncate(String error) {
        if (error == null) {
            return null;
        }
        return error.length() <= MAX_ERROR_LENGTH ? error : error.substring(0, MAX_ERROR_LENGTH);
    }
}


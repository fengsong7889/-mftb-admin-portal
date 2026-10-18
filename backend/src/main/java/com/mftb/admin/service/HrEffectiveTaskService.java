package com.mftb.admin.service;

import com.mftb.admin.entity.HrEffectiveTask;
import com.mftb.admin.entity.HrLifecycleRequest;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * HR 待生效任务（轻量 outbox）读写口。
 * <p>
 * 只有经本服务落库的任务才会被执行，因此「审批通过」与「登记待执行」必须在同一事务里完成：
 * 分两次写会出现「审批过了但没人执行」或「执行了两遍」。
 */
public interface HrEffectiveTaskService {

    /**
     * 登记/更新一条待生效任务（幂等：一条单据只有一个任务）。
     * <p>重复调用会把状态重置为 PENDING 并更新生效日，用于「批准后改生效日」的场景。
     */
    void schedule(HrLifecycleRequest request, LocalDate effectiveDate, String operator);

    /** 到期任务：状态为 PENDING 且生效日不晚于 today，按生效日升序（早到期先执行） */
    List<HrEffectiveTask> dueTasks(LocalDate today, int limit);

    /** 标记执行完成（无任务行时静默跳过：立即生效的单据本来就不建任务） */
    void markDone(Long requestId, String operator);

    /**
     * 标记执行失败：attempts+1、记录原因，等待人工重试（不自动无限重试，避免每天刷同一份错账）。
     * <p>没有任务行时补建一条：立即生效的单据办理失败也必须出现在待办里，
     * 否则“办理失败”只藏在单据 remark 中，没人看得见也没法重试。
     */
    void markFailed(Long requestId, HrLifecycleRequest request, String error, String operator);

    /** 撤销/驳回时作废任务，防止已撤回的单据到点仍被改判任职 */
    void cancel(Long requestId, String operator);

    /** 单据对应的任务（可能不存在） */
    Optional<HrEffectiveTask> ofRequest(Long requestId);

    /**
     * 批量取任务（列表页用）：避开一人一次查询的 N+1，也避开在列表循环里拼 SQL。
     *
     * @return requestId → 任务；无任务的单据不出现在结果里
     */
    Map<Long, HrEffectiveTask> ofRequests(Collection<Long> requestIds);
}

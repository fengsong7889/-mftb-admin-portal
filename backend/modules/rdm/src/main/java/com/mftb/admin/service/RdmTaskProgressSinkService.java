/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.contracts.rdm.RdmTaskProgressSink;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * {@link RdmTaskProgressSink} 的 RDM 域实现：把 CPM 的一次记录变成 RDM 的一次正常上报。
 *
 * <p>整个实现只有一句实质代码——转调 {@link RdmDeliveryService#updateTaskProgress}。
 * 这不是偷懒，而是本端口存在的全部意义：那条路径上挂着可见性守卫、任务操作人守卫、
 * 期望进度乐观锁、action 白名单、PRD 任务的提交评审约束、完成/阻塞的说明必填、
 * 进度审计流水与交付项阶段重算。CPM 只要绕开它另写一条 UPDATE，
 * 上面每一条都会在某个时刻以「两边数字对不上但没人知道从哪步开始」的形式兑现。
 *
 * <p><b>刻意不回写工时</b>：RDM 的 {@code actualHours} 会走 {@code rdm_work_log}
 * 的「同人同任务同日累加」语义，CPM 一天保存两次就会把 RDM 的投入记成两倍。
 * 要打通投入工时必须在 RDM 侧先有「按来源覆盖」的明细口径，那是另一件事。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmTaskProgressSinkService implements RdmTaskProgressSink {

    private final RdmDeliveryService deliveryService;
    private final RdmWorkTaskMapper taskMapper;

    @Override
    public SyncResult applyProgress(SyncCommand command) {
        RdmWorkTask task = taskMapper.selectById(command.taskId());
        if (task == null || Integer.valueOf(1).equals(task.getDeleted())) {
            // 任务已不存在：这是「无处可写」而不是「写失败了」，措辞必须区分，
            // 否则用户会以为重试就能成功，反复点只会制造噪音
            return SyncResult.of("unavailable", "RDM 任務不存在或已刪除，無法回寫", null);
        }

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction(command.action());
        dto.setProgress(command.progress());
        dto.setExpectedProgress(command.expectedProgress());
        dto.setRemark(command.remark());
        // 留痕用幂等标识：RDM 进度流水里能看出这笔改动来自绩效记录，两侧对账才有依据
        dto.setClientRequestId(command.sourceSystem() + ":item:" + command.taskId());

        try {
            RdmDeliveryVO.Task updated = deliveryService.updateTaskProgress(command.taskId(), dto);
            return SyncResult.success("已同步到 RDM 任務 " + task.getTaskNo(), updated.getProgress());
        } catch (BusinessException e) {
            boolean conflict = e.getCode() != null && e.getCode() == ResultCode.CONFLICT.getCode();
            log.info("CPM 回寫 RDM 任務未生效: taskId={} action={} conflict={} message={}",
                    command.taskId(), command.action(), conflict, e.getMessage());
            // 只回原文案，不另编一句"更好听"的：RDM 说的拒绝理由才是用户能据以行动的信息
            return SyncResult.of(conflict ? "conflict" : "rejected", e.getMessage(), currentProgress(command.taskId()));
        }
    }

    /** 冲突时给出 RDM 侧真值：界面的「重新對齊」要用它把本地基准刷新到当前值。 */
    private Integer currentProgress(long taskId) {
        RdmWorkTask latest = taskMapper.selectById(taskId);
        return latest == null ? null : latest.getProgress();
    }

    /**
     * 只读探测：不判可见性也不判操作权，因为这里不写任何东西。
     *
     * <p>刻意不做权限拒绝——重新对齐只需要「RDM 现在是几」，
     * 而这个人本来就有该任务的写权限才能走到回写路径（守卫在 applyProgress 那条路上）。
     * 真出现越权调用，界面上得到的也只是一个进度数字，不构成数据披露面的扩大。
     */
    @Override
    public TaskSnapshot probe(long taskId) {
        RdmWorkTask task = taskMapper.selectById(taskId);
        if (task == null || Integer.valueOf(1).equals(task.getDeleted())) {
            return TaskSnapshot.missing();
        }
        return new TaskSnapshot(true, task.getProgress(), task.getStatus(),
                RdmPrdTaskService.TASK_TYPE_PRD.equals(task.getTaskType()));
    }
}

package com.mftb.admin.service;

import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.HrOffboardingTask;

import java.time.LocalDate;
import java.util.List;

/**
 * 离职联动任务服务（方案 §7.4「账号停用、权限撤销、OA 待办转交、资产交接…分别有执行状态、
 * 失败原因和重试入口；重试不得重复生成业务单」）。
 * <p>
 * 离职办理只负责「把该做的事登记下来」，不负责「把别的事做完」：EAM 与 OA 的写入由本服务的
 * 执行器推进，失败可追踪可重试，且重复执行不会长第二张交接单。
 */
public interface HrOffboardingTaskService {

    /**
     * 离职办理完成后登记联动任务（幂等：同一单据同一类型只保留一行）。
     * <p>由离职事务内部调用，必须与离职事实同事务落库。
     */
    void scheduleForDimission(HrLifecycleRequest request, LocalDate effectiveDate, String operator);

    /** 某张离职单的联动任务（按类型顺序） */
    List<HrOffboardingTask> listByRequest(Long requestId);

    /**
     * 执行单个任务。
     * <p>终态（DONE/SKIPPED）直接拒绝 —— 这是「重试不重复建交接单」的最后一道闸。
     *
     * @return true 表示本次执行进入了终态
     */
    boolean execute(Long taskId, String operator);

    /**
     * 指定/变更交接接收人（写回离职单据），并把该单的待执行任务重新摆上台面。
     * <p>接收人必填是业务事实：资产交给谁、待办转给谁不能由代码猜（默认给上级会让人误以为是本人同意）。
     */
    void assignReceiver(Long requestId, Long receiverUserId, String operator);

    /** 到期任务 id 列表（供定时任务拾取；不限制=系统级作业） */
    List<HrOffboardingTask> dueTasks(LocalDate today);
}

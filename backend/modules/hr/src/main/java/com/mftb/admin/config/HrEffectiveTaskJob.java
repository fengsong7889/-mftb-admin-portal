package com.mftb.admin.config;

import com.mftb.admin.contracts.hr.HrLifecycleCallbackService;
import com.mftb.admin.entity.HrEffectiveTask;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.service.HrEffectiveTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;

/**
 * HR 待生效任务执行器：把「批准后到生效日前」的那段等待真正落地。
 * <p>
 * 每小时扫一次而不是每天 00:05 一次：HR 在上午补录一张「今天生效」的单据时，
 * 等到第二天才会生效会被当成 bug；同一单据由 {@code hr_effective_task.uk_effective_request}
 * 与回调内部的 completed 短路共同保证重复执行不会长出第二份职务记录。
 * <p>
 * 只捞 PENDING：FAILED 不自动重试，由 HR 在单据页显式点「立即办理」。
 * 无限自动重试会让同一份错账每天重复发生一次，且没人被提醒去修数据。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrEffectiveTaskJob {

    /** 单轮上限：一批 200 条足够覆盖全公司同日生效的异动，也避免一次任务把库压住 */
    private static final int BATCH_LIMIT = 200;

    private final HrEffectiveTaskService taskService;
    private final HrLifecycleRequestMapper requestMapper;
    private final HrLifecycleCallbackService callbackService;

    /** 固定每小时的第 5 分钟执行（避开整点的编号生成与钉钉同步任务） */
    @Scheduled(cron = "${hr.effective-task.cron:0 5 * * * ?}")
    public void runDue() {
        List<HrEffectiveTask> due = taskService.dueTasks(LocalDate.now(), BATCH_LIMIT);
        if (due.isEmpty()) {
            return;
        }
        int done = 0;
        int failed = 0;
        for (HrEffectiveTask task : due) {
            try {
                execute(task);
                done++;
            } catch (Exception e) {
                // 单条失败不阻断整批：一个员工的数据问题不该让全公司的异动都停住
                failed++;
                log.error("HR 待生效任务执行失败: reqNo={}, error={}", task.getReqNo(), e.getMessage(), e);
            }
        }
        log.info("HR 待生效任务本轮完成: 到期={}, 成功={}, 失败={}", due.size(), done, failed);
    }

    private void execute(HrEffectiveTask task) {
        HrLifecycleRequest req = task.getRequestId() == null ? null : requestMapper.selectById(task.getRequestId());
        if (req == null) {
            taskService.markFailed(task.getRequestId(), null, "關聯單據不存在", "系統（待生效任務）");
            return;
        }
        if (!StringUtils.hasText(req.getFlowNo())) {
            taskService.markFailed(task.getRequestId(), req, "單據未關聯 OA 流程，無法自動辦理", "系統（待生效任務）");
            return;
        }
        // 复用审批回调的同一个入口：待生效到点后走的代码路径与「立即生效」完全一致
        callbackService.onFlowApproved(req.getFlowNo());
    }
}


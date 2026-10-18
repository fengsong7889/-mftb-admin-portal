package com.mftb.admin.config;

import com.mftb.admin.entity.HrOffboardingTask;
import com.mftb.admin.service.HrOffboardingTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * 离职联动任务执行器：把离职后该做的跨模块动作真正推进（资产交接、待办改派）。
 * <p>
 * 只拾取 PENDING，不拾取 FAILED —— 自动重跑一个每晚都失败的任务等于每天刷一次同一份错账；
 * 失败任务必须带可读原因由人判断后再点重试（方案 §7.4「失败原因和重试入口」）。
 * <p>
 * 固定每小时第 25 分钟：错开待生效任务(05 分)与钉钉打卡同步，避免同一时间窗内互相抢连接。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrOffboardingTaskJob {

    /** 系统执行者的操作人快照：与「系統（待生效任務）」同一命名法，便于事后区分人肉与机器 */
    static final String SYSTEM_OPERATOR = "系統（離職聯動）";

    private final HrOffboardingTaskService offboardingTaskService;

    @Scheduled(cron = "${hr.offboarding-task.cron:0 25 * * * ?}")
    public void runDue() {
        List<HrOffboardingTask> due = offboardingTaskService.dueTasks(LocalDate.now());
        if (due.isEmpty()) {
            return;
        }
        int terminal = 0;
        int pending = 0;
        for (HrOffboardingTask task : due) {
            try {
                // execute 内部已把失败落成 FAILED + last_error，这里只需兜住意外异常不让整批停住
                if (offboardingTaskService.execute(task.getId(), SYSTEM_OPERATOR)) {
                    terminal++;
                } else {
                    pending++;
                }
            } catch (Exception e) {
                pending++;
                log.error("离职联动任务执行异常: type={}, reqNo={}, error={}",
                        task.getTaskType(), task.getReqNo(), e.getMessage(), e);
            }
        }
        log.info("离职联动任务本轮完成: 到期={}, 进入终态={}, 未决={}", due.size(), terminal, pending);
    }
}

package com.mftb.admin.config;

import com.mftb.admin.service.RdmTodoNotifyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * RDM 待办通知 / 工作日催办作业（任务22 B.4 / B.5）。
 *
 * <p><b>为什么催办不用「周一至周五 9 点」的 cron</b>：cron 只看星期几，看不见
 * 请假、调休与周末支援。用简单 cron 会出现两种错误：别人休假时照样催（骚扰且无效），
 * 长假结束后第一天一次性催出好几天的量（噪音淹没真正紧急的事）。因此这里的 cron 只负责
 * <b>「每天醒来一次」</b>，「今天到底要不要催某个人」由
 * {@link RdmTodoNotifyService#isWorkingDayFor}（真实工作日历，含请假/周末支援）逐人判定，
 * 不满足就顺延到该人的下一个工作日。
 *
 * <p><b>重复触发不会重复轰炸</b>：催办按 {@code DATE:<提醒日>} 去重、待办通知按
 * {@code VERSION:<对象并发版本>} 去重，两层都由 {@code rdm_notify_log.dedupe_key} 的
 * 唯一索引 {@code uk_rdm_notify_dedupe} 兜底。因此本作业<b>刻意不使用</b> MySQL 命名锁：
 * 多实例并发触发时，正确性由数据库唯一约束保证（命名锁 GET_LOCK 与连接的绑定行为
 * 在本项目已被列为待验证项，{@link RdmNotifyRetryJob} 同样刻意不依赖它），
 * 锁最多只能省掉一些无用查询，不能当作正确性前提。
 *
 * <p><b>dry-run 与出站</b>：本作业只负责「决定要不要通知谁」，真正的入队与投递一律经
 * {@code RdmNotifyService} → {@code RdmNotifyDispatcher}，因此 {@code rdm.notify.dry-run=true}
 * 时不会向真实外部收件人发送任何消息；{@code rdm.notify.todo-enabled=false} 可整体停用本作业。
 *
 * <p><b>异常隔离</b>：定时任务抛异常会打断后续调度，因此两个入口都吞掉异常只记日志，
 * 下一轮按去重键自然续跑（已发过的不会重发，漏掉的会被重新扫到）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmTodoNotifyJob {

    private final RdmTodoNotifyService todoNotifyService;

    /** 总开关：非生产环境可整体停用待办通知与催办（与 dry-run 正交，两者都不弱化去重） */
    @Value("${rdm.notify.todo-enabled:true}")
    private boolean todoEnabled;

    /**
     * 工作日催办：默认每天 09:00 触发一次（可用 {@code rdm.notify.todo-urge-cron} 覆盖）。
     * <p>作业模式（{@code projectId = null}）：扫描全部在途项目，逐个用该项目 PM 作视角，
     * 因此不存在「全量视角」，也不会把 A 项目的待办说给 B 项目的 PM 听。
     */
    @Scheduled(cron = "${rdm.notify.todo-urge-cron:0 0 9 * * *}")
    public void urgeOverdueTodos() {
        if (!todoEnabled) {
            log.debug("RDM 待辦作業已停用（rdm.notify.todo-enabled=false），跳過催辦");
            return;
        }
        LocalDate today = LocalDate.now();
        try {
            RdmTodoNotifyService.TodoNotifyResult result = todoNotifyService.urgeOverdueTodos(null, null, today);
            log.info("RDM 催辦作業完成: day={}, 掃描項目={}, 掃描待辦={}, 新入隊={}, 去重跳過={}, 非工作日={}, "
                            + "未達門檻={}, 未指派={}",
                    today, result.getScannedProjects(), result.getScannedTodos(), result.getNotified(),
                    result.getDeduped(), result.getNonWorkingDay(), result.getBelowThreshold(),
                    result.getUnassigned());
        } catch (Exception e) {
            log.error("RDM 催辦作業失敗（不影響後續調度，下一輪按去重鍵續跑）: day={}, error={}",
                    today, e.getMessage(), e);
        }
    }

    /**
     * PM 待办通知：默认每 10 分钟扫描一次待办的产生/变更（可用
     * {@code rdm.notify.todo-scan-interval-ms} / {@code rdm.notify.todo-initial-delay-ms} 覆盖）。
     * <p>同一对象同一并发版本同一接收人只通知一次，因此扫描频率可以调高而不产生噪音。
     */
    @Scheduled(fixedDelayString = "${rdm.notify.todo-scan-interval-ms:600000}",
            initialDelayString = "${rdm.notify.todo-initial-delay-ms:180000}")
    public void notifyPendingTodos() {
        if (!todoEnabled) {
            log.debug("RDM 待辦作業已停用（rdm.notify.todo-enabled=false），跳過待辦通知");
            return;
        }
        try {
            RdmTodoNotifyService.TodoNotifyResult result = todoNotifyService.notifyPendingTodos(null, null);
            if (result.getNotified() > 0 || result.getFailed() > 0) {
                log.info("RDM 待辦通知作業完成: 掃描項目={}, 掃描待辦={}, 新入隊={}, 去重跳過={}, 未指派={}",
                        result.getScannedProjects(), result.getScannedTodos(), result.getNotified(),
                        result.getDeduped(), result.getUnassigned());
            }
        } catch (Exception e) {
            log.error("RDM 待辦通知作業失敗（不影響後續調度，下一輪按去重鍵續跑）: error={}", e.getMessage(), e);
        }
    }
}

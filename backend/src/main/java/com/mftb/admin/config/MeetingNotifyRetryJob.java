package com.mftb.admin.config;

import com.mftb.admin.service.MeetingNotifyDispatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 会议通知补发作业：扫描到期的投递任务并补发。
 *
 * <p>与 {@code RdmNotifyRetryJob} 同构，理由也一样：多实例下真正需要的是「同一个任务只被一个执行者拿走」，
 * 这由 {@link MeetingNotifyDispatcher} 的条件更新抢占保证，不依赖 GET_LOCK 与连接绑定的隐式行为。
 * 本作业额外做一件抢占做不到的事：把实例崩溃遗留的「投递中」行回收，避免任务永久卡死。
 *
 * <p>可用 {@code meeting.job.enabled=false} 即时停用（回滚方案里"定时任务"这一层的落点）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingNotifyRetryJob {

    /** 单轮最多补发条数：渠道恢复后不是一次打出一大片 */
    private static final int BATCH_SIZE = 20;
    /** 投递中超过该分钟数视为执行者已丢失 */
    private static final int STUCK_MINUTES = 10;

    private final MeetingNotifyDispatcher dispatcher;

    /** 作业开关：上线回滚时只改配置不改代码（调度仍触发，但一进方法就返回） */
    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    @Scheduled(fixedDelayString = "${meeting.notify.retry-interval-ms:60000}",
            initialDelayString = "${meeting.notify.initial-delay-ms:90000}")
    public void drain() {
        if (!jobEnabled) {
            return;
        }
        try {
            int recovered = dispatcher.recoverStuck(STUCK_MINUTES);
            if (recovered > 0) {
                log.warn("會議通知回收卡在投遞中的任務: {} 條（執行者可能已重啟）", recovered);
            }
            List<Long> due = dispatcher.dueIds(BATCH_SIZE);
            for (Long id : due) {
                dispatcher.send(id);
            }
            if (!due.isEmpty()) {
                log.info("會議通知補發完成: 本輪領取={} 條（結果由渠道回調異步落狀態）", due.size());
            }
        } catch (Exception e) {
            // 定时任务异常不能打断后续调度：下一轮按 next_retry_at 继续
            log.error("會議通知補發作業失敗: {}", e.getMessage(), e);
        }
    }
}

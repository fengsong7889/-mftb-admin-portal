package com.mftb.admin.config;

import com.mftb.admin.service.RdmNotifyDispatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * RDM 通知重试作业：扫描到期的投递任务并补发。
 *
 * <p>为什么不用命名锁去重：多实例下真正需要的是「同一个任务只被一个执行者拿走」，
 * 而这由 {@link RdmNotifyDispatcher} 的条件更新抢占保证（{@code WHERE send_status IN ('pending','failed')}）；
 * 命名锁依赖 GET_LOCK 与连接的绑定关系，跨连接的行为不可靠（本项目已把它列为待验证项）。
 * 这里只额外做一件锁做不到的事：把实例崩溃遗留的 sending 行回收，避免任务永久卡在「投递中」。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmNotifyRetryJob {

    /** 单轮最多补发条数：避免渠道恢复后一次打出去一大片 */
    private static final int BATCH_SIZE = 20;
    /** sending 超过该分钟数视为执行者已丢失，回收为 failed */
    private static final int STUCK_MINUTES = 10;

    private final JdbcTemplate jdbcTemplate;
    private final RdmNotifyDispatcher dispatcher;

    /** 默认每 1 分钟一轮，可用 rdm.notify.retry-interval-ms 覆盖 */
    @Scheduled(fixedDelayString = "${rdm.notify.retry-interval-ms:60000}",
            initialDelayString = "${rdm.notify.initial-delay-ms:90000}")
    public void drain() {
        try {
            int recovered = jdbcTemplate.update(
                    "UPDATE rdm_notify_log SET send_status = 'failed', next_retry_at = NOW(), updated_at = NOW() "
                            + "WHERE deleted = 0 AND send_status = 'sending' "
                            + "AND updated_at < DATE_SUB(NOW(), INTERVAL " + STUCK_MINUTES + " MINUTE)");
            if (recovered > 0) {
                log.warn("RDM 通知回收卡在投遞中的任務: {} 條（執行者可能已重啟）", recovered);
            }
            List<Long> due = jdbcTemplate.queryForList(
                    "SELECT id FROM rdm_notify_log WHERE deleted = 0 AND send_status IN ('pending','failed') "
                            + "AND (next_retry_at IS NULL OR next_retry_at <= NOW()) ORDER BY id LIMIT " + BATCH_SIZE,
                    Long.class);
            for (Long id : due) {
                dispatcher.send(id);
            }
            if (!due.isEmpty()) {
                log.info("RDM 通知補發完成: 本輪領取={} 條", due.size());
            }
        } catch (Exception e) {
            // 定时任务异常不能打断后续调度：下一轮按 next_retry_at 继续
            log.error("RDM 通知補發作業失敗: {}", e.getMessage(), e);
        }
    }
}

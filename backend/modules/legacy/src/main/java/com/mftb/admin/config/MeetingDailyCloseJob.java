package com.mftb.admin.config;

import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.service.MeetingBookingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 会议每日收尾作业（默认 00:10 一轮）：昨日会议收尾 + 离职参会人标失效。
 *
 * <p>为什么按 cron 而不是 fixedDelay：收尾的语义是"跨过一天之后把昨天的账结清"，
 * 用固定间隔会让每天的实际执行时刻随进程重启时间漂移，漂移之后使用率报表的日期口径
 * 就会跟着漂（同一场会可能今天算进昨天、明天算进今天）。
 *
 * <p>两件事都做成可重复执行：收尾靠状态条件更新，离职标记靠幂等的 {@code response=invalid}
 * 判定，所以补跑、重跑、多实例并发都不会产生第二份事实。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingDailyCloseJob {

    /** 单轮上限：一轮收 500 场足够覆盖一天的量，剩下的下一轮继续 */
    private static final int BATCH_SIZE = 500;

    private final MeetingBookingService bookingService;

    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    /** 时区跟随服务器；跨零点会议按"结束时刻已过"判定归属，与使用率统计同口径 */
    @Scheduled(cron = "${meeting.daily-close-cron:0 10 0 * * *}")
    public void close() {
        if (!jobEnabled) {
            return;
        }
        try {
            closeStale();
            invalidateDeactivated();
        } catch (Exception e) {
            log.error("會議每日收尾作業失敗: {}", e.getMessage(), e);
        }
    }

    private void closeStale() {
        List<MeetingBooking> stale = bookingService.findStaleOccupying(BATCH_SIZE);
        int closed = 0;
        for (MeetingBooking booking : stale) {
            try {
                if (bookingService.finishAsSystem(booking)) {
                    closed++;
                }
            } catch (Exception e) {
                log.warn("會議自動收尾失敗: bookingNo={}, error={}", booking.getBookingNo(), e.getMessage());
            }
        }
        log.info("會議每日收尾完成: 候選 {} 場，實際收尾 {} 場", stale.size(), closed);
    }

    private void invalidateDeactivated() {
        int marked = bookingService.markDeactivatedAttendees(BATCH_SIZE);
        if (marked > 0) {
            log.info("未來會議中已停用帳號的參會人已標失效: {} 行（歷史會議不改寫）", marked);
        }
    }
}

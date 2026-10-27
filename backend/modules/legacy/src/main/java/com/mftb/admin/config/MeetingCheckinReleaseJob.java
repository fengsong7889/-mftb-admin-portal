package com.mftb.admin.config;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.service.MeetingBookingService;
import com.mftb.admin.service.MeetingNotifyDispatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 会议签到治理作业（每 1 分钟一轮）：超时未签到自动释放 + 开始前提醒投递。
 *
 * <p>两件事放同一轮是刻意的：它们都按"距开始多少分钟"扫描同一批占用单，
 * 拆成两个作业只是多一次全表扫描，而且会让"释放了却没提醒过"这种交叉状态更难解释。
 *
 * <p>逐条调用服务层的事务方法而不是整批一个事务：一场会释放失败不该把同轮其他会一起回滚，
 * 那会让下一轮"全部重来并且可能全部再失败"。
 *
 * <p>幂等靠数据库而不是靠"记号"：释放靠状态条件更新（只能从占用态推进一次），
 * 提醒靠通知留痕表 {@code UNIQUE(booking_id, event_code, receiver_user_id)}，
 * 所以本作业重复执行、多实例并发执行都不会重复推送。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingCheckinReleaseJob {

    /** 单轮上限：一次最多处理这么多场，剩下的下一轮继续（避免长时间占用调度线程） */
    private static final int BATCH_SIZE = 50;

    private final MeetingBookingService bookingService;
    private final MeetingNotifyDispatcher notifyDispatcher;

    /** 与通知补发作业共用总开关：回滚时只关配置不改代码 */
    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    @Scheduled(fixedDelayString = "${meeting.checkin-scan-interval-ms:60000}",
            initialDelayString = "${meeting.job.initial-delay-ms:120000}")
    public void drain() {
        if (!jobEnabled) {
            return;
        }
        try {
            releaseOverdue();
            remindUpcoming();
        } catch (Exception e) {
            // 定时任务异常不能打断后续调度
            log.error("會議簽到治理作業失敗: {}", e.getMessage(), e);
        }
    }

    /** 超时未签到 → 释放房间并记爽约（达阈值时由服务层联动自动拉黑） */
    private void releaseOverdue() {
        List<MeetingBooking> candidates = bookingService.findReleasable(BATCH_SIZE);
        int released = 0;
        for (MeetingBooking booking : candidates) {
            try {
                if (bookingService.releaseAsNoShow(booking,
                        "開始後超過設定時間無人簽到，系統自動釋放會議室")) {
                    released++;
                }
            } catch (Exception e) {
                log.warn("超時未簽到釋放失敗: bookingNo={}, error={}", booking.getBookingNo(), e.getMessage());
            }
        }
        if (released > 0) {
            log.info("超時未簽到自動釋放完成: 本輪釋放 {} 場", released);
        }
    }

    /** 开始前 N 分钟提醒；N 为 0 时服务层直接返回空集（等于关闭提醒） */
    private void remindUpcoming() {
        List<MeetingBooking> due = bookingService.findRemindDue(BATCH_SIZE);
        int queued = 0;
        for (MeetingBooking booking : due) {
            try {
                List<Long> receivers = bookingService.receiversOf(booking.getId());
                // 组织者也要收到自己会议的提醒：他同样会忘记自己的例会
                if (!receivers.contains(booking.getOrganizerId())) {
                    receivers = new java.util.ArrayList<>(receivers);
                    receivers.add(booking.getOrganizerId());
                }
                notifyDispatcher.enqueue(booking, MeetingConstants.NOTIFY_EVT_REMIND,
                        MeetingConstants.SCENARIO_REMIND, receivers, null);
                queued++;
            } catch (Exception e) {
                log.warn("開始前提醒登记失敗: bookingNo={}, error={}", booking.getBookingNo(), e.getMessage());
            }
        }
        if (queued > 0) {
            log.info("開始前提醒已登记: 本輪 {} 場（重復執行由唯一鍵去重）", queued);
        }
    }
}

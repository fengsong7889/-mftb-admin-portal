/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
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
 * 会议结束自动收尾作业（每 1 分钟一轮）：会议到达结束时间后自动释放会议室，
 * 不等待每日 00:10 的收尾作业。
 *
 * <p>与 {@link MeetingDailyCloseJob} 的区别：
 * <ul>
 *   <li>本作业按"结束时刻已过"实时收尾，用户感知更及时；</li>
 *   <li>每日收尾仍保留，作为兜底处理本作业漏跑或进程重启期间的积压。</li>
 * </ul>
 *
 * <p>幂等靠 {@code finishAsSystem} 的状态条件更新保证：会议已收尾时 WHERE 条件不命中，
 * 重复执行不会产生第二份事实。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingEndReleaseJob {

    /** 单轮上限：一次最多处理 50 场，剩下的下一轮继续 */
    private static final int BATCH_SIZE = 50;

    private final MeetingBookingService bookingService;

    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    @Scheduled(fixedDelayString = "${meeting.end-release-scan-interval-ms:60000}",
            initialDelayString = "${meeting.job.initial-delay-ms:120000}")
    public void drain() {
        if (!jobEnabled) {
            return;
        }
        try {
            releaseEnded();
        } catch (Exception e) {
            log.error("會議結束自動收尾作業失敗: {}", e.getMessage(), e);
        }
    }

    /** 已过结束时间但仍占用中的会议 → 自动收尾释放房间 */
    private void releaseEnded() {
        List<MeetingBooking> candidates = bookingService.findStaleOccupying(BATCH_SIZE);
        int released = 0;
        for (MeetingBooking booking : candidates) {
            try {
                if (bookingService.finishAsSystem(booking)) {
                    released++;
                }
            } catch (Exception e) {
                log.warn("會議結束自動收尾失敗: bookingNo={}, error={}", booking.getBookingNo(), e.getMessage());
            }
        }
        if (released > 0) {
            log.info("會議結束自動收尾完成: 本輪收尾 {} 場", released);
        }
    }
}

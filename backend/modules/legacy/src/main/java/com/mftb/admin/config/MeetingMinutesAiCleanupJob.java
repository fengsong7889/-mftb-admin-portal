package com.mftb.admin.config;

import com.mftb.admin.service.minutes.MeetingMinutesAiService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 会议纪要 AI 提取的回收作业：崩溃遗留的处理中请求转「未知」，超期原文快照与结果清空。
 *
 * <p>独立作业而非请求内顺带处理：清理失败只影响回收，不挡提取；多实例并发靠
 * 「WHERE status=0」/「WHERE result_expires_at < now」的条件更新收敛，重复执行安全。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingMinutesAiCleanupJob {

    private final MeetingMinutesAiService aiService;

    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    @Scheduled(cron = "${meeting.minutes.ai-cleanup-cron:0 50 * * * *}")
    public void cleanup() {
        if (!jobEnabled) {
            return;
        }
        try {
            int handled = aiService.cleanupExpired();
            if (handled > 0) {
                log.info("会议纪要 AI 提取回收: {} 条（处理中转未知 / 过期载荷清空）", handled);
            }
        } catch (Exception e) {
            log.error("会议纪要 AI 提取回收作业失敗: {}", e.getMessage(), e);
        }
    }
}

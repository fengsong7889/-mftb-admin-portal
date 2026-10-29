package com.mftb.admin.config;

import com.mftb.admin.service.MeetingMinutesService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 纪要附件回收作业：清理「上传了但一直没随纪要保存」的过期文件。
 *
 * <p>为什么按小时而不是等上传顺带清：上传是用户动作，顺带删别人的候选行
 * 会把"谁触发了谁的删除"混进业务请求里；独立作业失败只影响回收，不挡上传。
 *
 * <p>可重复执行：删除靠「状态=未绑定 且 上传人匹配」的条件更新，多实例并发
 * 同一行只有一个能删到 1 行；对象删除失败只留日志，行已删除即视为回收完成。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingAttachmentCleanupJob {

    private final MeetingMinutesService minutesService;

    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    @Scheduled(cron = "${meeting.attachment-cleanup-cron:0 40 * * * *}")
    public void cleanup() {
        if (!jobEnabled) {
            return;
        }
        try {
            int removed = minutesService.cleanupAttachments();
            if (removed > 0) {
                log.info("纪要过期未绑定附件已回收: {} 个（单轮上限 200，剩余下一轮继续）", removed);
            }
        } catch (Exception e) {
            log.error("纪要附件回收作业失敗: {}", e.getMessage(), e);
        }
    }
}

package com.mftb.admin.config;

import com.mftb.admin.service.AttendanceSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 钉钉考勤打卡同步作业。
 * <p>
 * 默认每天 06:00 与 22:00 各一轮（与假勤设置里展示的批次时间一致），可用
 * {@code attendance.sync.cron} 覆盖；同步区间取「昨天~今天」，
 * 因为跨天夜班的下班卡会落在次日凌晨。
 * <p>
 * 失败只记日志：定时任务不能因为一次上游异常打断后续调度，
 * 更不允许在失败时清空既有打卡明细（缺数可以补，删掉补不回来）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AttendancePunchSyncJob {

    private final AttendanceSyncService syncService;

    @Scheduled(cron = "${attendance.sync.cron:0 0 6,22 * * ?}")
    public void sync() {
        LocalDate today = LocalDate.now();
        try {
            var summary = syncService.sync(today.minusDays(1), today, null);
            log.info("定時同步釘釘打卡完成: {}", summary);
        } catch (Exception e) {
            log.error("定時同步釘釘打卡失敗（保留既有明細，下一輪重試）: {}", e.getMessage());
        }
    }
}

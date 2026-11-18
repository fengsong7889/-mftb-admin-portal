/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.config;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.mapper.CpmAiExtractionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.service.cpm.CpmAccessGuard;
import com.mftb.admin.service.cpm.CpmPeriods;
import com.mftb.admin.service.cpm.CpmRuleService;
import com.mftb.admin.service.cpm.CpmTeamService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * CPM 定时作业：截止催办、主管推导线重建、AI 台账清扫。
 *
 * <p>三条纪律：
 * 1. 催办只发「提醒本人」，且只在提醒窗口（deadline - remindBeforeHours 至截止后 6 小时）内发——
 *    过期不回补、不升级、不通报上级：反内卷红线在服务端成立，而不是靠 UI 克制；
 * 2. 一切发送经 push_record claim 幂等，多实例并发 tick 与重启补跑都只出一条；
 * 3. 推导线每周重建（组织变动的生效周期=一周，足够），重建只动 dept_manager 线、不碰 explicit 线。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CpmScheduler {

    private final CpmPeriods periods;
    private final CpmRuleService ruleService;
    private final CpmReportMapper reportMapper;
    private final CpmTeamService teamService;
    private final CpmAccessGuard guard;
    private final CpmAiExtractionMapper extractionMapper;

    /** 催办扫描：每小时一档（同小时重复 tick 被 push_record 幂等挡下）。 */
    @Scheduled(fixedDelayString = "${cpm.remind.scan-interval-ms:3600000}",
            initialDelayString = "${cpm.remind.initial-delay-ms:240000}")
    public void scanDeadlineReminders() {
        // 调度线程没有登录态：必须走 readForScheduler，否则 guard.currentUser() 抛「登錄狀態失效」，
        // 催办扫描每小时失败一次而界面上完全看不出来（规则页照常显示配置）
        CpmDto.RuleVO rule = ruleService.readForScheduler();
        if (!Boolean.TRUE.equals(rule.getEnabled())
                || rule.getPeriodTypes() == null || !rule.getPeriodTypes().contains(CpmConstants.PERIOD_WEEK)) {
            return;
        }
        LocalDate today = periods.today();
        // 只在截止日当天进入提醒窗口（星期口径 1=周一…7=周日）
        if (today.getDayOfWeek() != DayOfWeek.of(rule.getDeadlineDay())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now(periods.zone());
        LocalTime deadline = LocalTime.parse(rule.getDeadlineTime());
        LocalDateTime remindFrom = deadline
                .minusHours(rule.getRemindBeforeHours() == null ? 0 : rule.getRemindBeforeHours()).atDate(today);
        if (now.isBefore(remindFrom) || now.isAfter(deadline.atDate(today).plusHours(6))) {
            // 窗口前不动作；窗口后（截止 +6h）不再 nag——过期是既成事实，用催办粉饰只会制造噪音
            return;
        }
        LocalDate weekStart = today.minusDays(today.getDayOfWeek().getValue() - 1L);
        List<Long> missing = reportMapper.listUsersWithoutPublished(CpmConstants.PERIOD_WEEK, weekStart);
        if (missing.isEmpty()) {
            return;
        }
        String text = "本週匯報截止 " + rule.getDeadlineTime() + "，請盡快完成記錄並發布。";
        for (Long userId : missing) {
            teamService.remindNow(userId, weekStart, text);
        }
        log.info("[CpmScheduler] 截止催辦掃描 weekStart={} 未交={}（dry-run 下全部 skipped 留痕）", weekStart, missing.size());
    }

    /** 主管推导线重建：每周一 03:15（组织变动生效周期=一周；重建失败下周自动重试，不阻断启动）。 */
    @Scheduled(cron = "${cpm.grant-rebuild.cron:0 15 3 * * MON}", zone = "Asia/Shanghai")
    public void rebuildDerivedGrants() {
        try {
            int inserted = guard.rebuildDerivedGrants();
            log.info("[CpmScheduler] 主管推導可見性線重建完成，新增 {} 行", inserted);
        } catch (RuntimeException e) {
            log.warn("[CpmScheduler] 推導線重建失敗（下週自動重試）: {}", e.getMessage());
        }
    }

    /** 悬挂 processing 清扫：每 30 分钟。模型预算 60s，超 2 分钟仍 processing 的行只可能是进程中途死掉。 */
    @Scheduled(fixedDelayString = "${cpm.ai-expire.scan-interval-ms:1800000}")
    public void expireStaleProcessing() {
        int expired = extractionMapper.expireStaleProcessing(LocalDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(2));
        if (expired > 0) {
            log.info("[CpmScheduler] AI 台賬悬挂清掃 expired={}", expired);
        }
    }

    /** 敏感载荷限期清除：每天 04:00，终态超 7 天的原文一律抹掉（台账不能变第二份永久档案）。 */
    @Scheduled(cron = "${cpm.ai-cleanup.cron:0 0 4 * * *}", zone = "Asia/Shanghai")
    public void cleanupAiPayloads() {
        int cleared = extractionMapper.clearExpiredPayloads(
                LocalDateTime.now(java.time.ZoneOffset.UTC).minusDays(7));
        if (cleared > 0) {
            log.info("[CpmScheduler] AI 原文清掃 clearedPayloads={}", cleared);
        }
    }
}

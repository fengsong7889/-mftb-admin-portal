package com.mftb.admin.config;

import com.mftb.admin.entity.SystemAccessRequest;
import com.mftb.admin.service.SystemAccessGrantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 系統權限申請的到期回收作业（默认每日 03:20 一轮）。
 * <p>
 * 回收规则：只有「申请时选了使用期限=至指定日期」「本单确实新绑了角色」且「到期日已过」的
 * 授权才会被收回（到期日当天仍可用，次日起回收）；使用期限=长期的永不回收。
 *
 * <p>为什么按 cron 而不是 fixedDelay：回收的语义是「跨过到期日之后把该收的权限收掉」，
 * 用固定间隔会让执行时刻随进程重启时间漂移，也让「昨天到期今天几点收」变得不可预期。
 *
 * <p>可重复执行、可多实例并发：每条单据的回收是一个独立事务，靠
 * {@code revoke_status='none'} 的条件更新做认领（见 {@link SystemAccessGrantService#expireGrant}），
 * 补跑、重跑、多实例同时扫都不会产生第二份回收，也不会出现「标了已回收但权限还在身上」的假回收。
 *
 * <p>单条失败只记日志、不中断整轮：状态留在 none，下一轮自然重试；把整轮抛掉反而会让
 * 排在后面的用户一直收不到回收。单轮上限 {@value #BATCH_SIZE} 条，剩下的下一轮继续。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SystemAccessExpiryJob {

    /** 单轮处理上限：一次权限申请的授权量级很小，200 条足够覆盖任何一天到期的量 */
    static final int BATCH_SIZE = 200;

    private final SystemAccessGrantService grantService;

    /** 紧急停用开关：改配置即可，不需要发版（回收有副作用，出问题时先停再说） */
    @Value("${system-access.expiry.enabled:true}")
    private boolean enabled;

    @Scheduled(cron = "${system-access.expiry-cron:0 20 3 * * *}")
    public void expireOverdueGrants() {
        if (!enabled) {
            log.debug("系統權限申請到期回收作业已由配置停用（system-access.expiry.enabled=false）");
            return;
        }
        List<SystemAccessRequest> candidates;
        try {
            candidates = grantService.findExpiredGrants(BATCH_SIZE);
        } catch (Exception e) {
            // 扫不到就整轮放弃：不能拿 null 往下走，否则会静默"回收完成 0 条"掩盖真实故障
            log.error("系統權限申請到期回收扫描失败，本轮放弃: {}", e.getMessage(), e);
            return;
        }
        if (candidates.isEmpty()) {
            return;
        }
        int revoked = 0;
        int failed = 0;
        for (SystemAccessRequest candidate : candidates) {
            try {
                if (grantService.expireGrant(candidate.getId())) {
                    revoked++;
                }
            } catch (Exception e) {
                failed++;
                log.error("系統權限申請到期回收单条失败，留待下一轮重试: flowNo={}, error={}",
                        candidate.getFlowNo(), e.getMessage(), e);
            }
        }
        log.info("系統權限申請到期回收完成: 候选={}, 实际解绑={}, 失败={}, 单轮上限={}",
                candidates.size(), revoked, failed, BATCH_SIZE);
    }
}

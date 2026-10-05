package com.mftb.admin.config;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmNotifyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * RDM SLA 扫描任务：按环节标准时效标记逾期，并做「预警 → 升级」两段提醒。
 * <p>多副本部署用 MySQL 命名锁（GET_LOCK）串行化，避免同一需求被多个实例重复推送；
 * 提醒去重以 {@code rdm_notify_log} 为准（同事件 24 小时内只发一次），
 * 不做「发过就永不提醒」——长期停滞的需求仍需被持续看见。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmSlaScheduler {

    /** 命名锁键（与迁移锁分离，互不影响） */
    private static final String LOCK_KEY = "rdm_sla_scan";
    private static final int REMIND_INTERVAL_HOURS = 24;

    private final JdbcTemplate jdbcTemplate;
    private final RdmConfigService configService;
    private final RdmNotifyService notifyService;
    private final com.mftb.admin.mapper.RdmRequirementMapper requirementMapper;

    /** 默认每 30 分钟扫描一次，可用 rdm.sla.scan-interval-ms 覆盖 */
    @Scheduled(fixedDelayString = "${rdm.sla.scan-interval-ms:1800000}", initialDelayString = "${rdm.sla.initial-delay-ms:120000}")
    public void scan() {
        Integer locked = jdbcTemplate.queryForObject("SELECT GET_LOCK(?, 0)", Integer.class, LOCK_KEY);
        if (locked == null || locked != 1) {
            log.debug("RDM SLA 扫描跳过：其它实例持有命名锁");
            return;
        }
        try {
            doScan();
        } catch (Exception e) {
            // 定时任务失败不能打断调度线程；下一轮会自动重试
            log.error("RDM SLA 掃描失敗: {}", e.getMessage(), e);
        } finally {
            jdbcTemplate.queryForObject("SELECT RELEASE_LOCK(?)", Integer.class, LOCK_KEY);
        }
    }

    private void doScan() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, req_no, title, status, priority, submitter_user_id, submitter_name, "
                        + "assignee_pm_user_id, dev_owner_user_id, acceptor_user_id, current_handler_name, "
                        + "overdue_flag, TIMESTAMPDIFF(HOUR, status_enter_time, NOW()) AS stayed_hours "
                        + "FROM rdm_requirement WHERE deleted = 0 AND status_enter_time IS NOT NULL "
                        // 草稿/终态/挂起不计逾期（挂起是双方确认的合理等待）
                        + "AND status NOT IN ('draft','released','verified','closed','on_hold','rejected')");
        int overdueMarked = 0;
        int warned = 0;
        for (Map<String, Object> row : rows) {
            String status = (String) row.get("status");
            String priority = (String) row.get("priority");
            long stayed = toLong(row.get("stayed_hours"));
            Integer slaHours = configService.slaHours(status, priority);
            if (slaHours == null) {
                continue;
            }
            Integer warnHours = configService.warnHours(status, priority);
            boolean overdue = stayed > slaHours;
            boolean nearingWarn = warnHours != null && stayed >= warnHours && !overdue;
            if (!overdue && !nearingWarn) {
                continue;
            }
            Long reqId = toLong(row.get("id"));
            if (overdue && toInt(row.get("overdue_flag")) != 1) {
                jdbcTemplate.update("UPDATE rdm_requirement SET overdue_flag = 1 WHERE id = ? AND deleted = 0", reqId);
                overdueMarked++;
            }
            String event = overdue ? RdmConstants.EVENT_SLA_OVERDUE : RdmConstants.EVENT_SLA_WARN;
            if (alreadyNotified(reqId, event)) {
                continue;
            }
            sendRemind(row, event, stayed, slaHours);
            if (overdue) {
                warned++;
            }
        }
        if (overdueMarked > 0 || warned > 0) {
            log.info("RDM SLA 掃描完成: 檢查={} 條, 新標記逾期={} 條, 升級提醒={} 條",
                    rows.size(), overdueMarked, warned);
        }
    }

    private void sendRemind(Map<String, Object> row, String event, long stayed, int slaHours) {
        Long reqId = toLong(row.get("id"));
        String status = (String) row.get("status");
        String priority = (String) row.get("priority");
        boolean overdue = RdmConstants.EVENT_SLA_OVERDUE.equals(event);
        String label = configService.statusLabelMap().getOrDefault(status, status);
        StringBuilder text = new StringBuilder(overdue
                ? "### ⚠️ 需求已逾期，請盡快推進\n\n"
                : "### ⏳ 需求即將逾期\n\n");
        text.append("- **編號**: ").append(row.get("req_no"))
                .append("\n- **標題**: ").append(row.get("title"))
                .append("\n- **當前狀態**: ").append(label)
                .append("\n- **已停留**: ").append(stayed).append(" 小時（標準 ").append(slaHours).append(" 小時）")
                .append("\n- **優先級**: ").append(priority);
        if (overdue) {
            String escalate = configService.escalateRole(status, priority);
            if (StringUtils.hasText(escalate)) {
                text.append("\n\n已按規則升級提醒角色「").append(escalate).append("」，如需延期請更新計劃時間或说明阻塞原因。");
            }
        }
        // 接收人：产品经理 + 研发负责人 + 提出人（验收环节加验收人）
        java.util.List<Long> receivers = new java.util.ArrayList<>();
        addIfPresent(receivers, row.get("assignee_pm_user_id"));
        addIfPresent(receivers, row.get("dev_owner_user_id"));
        addIfPresent(receivers, row.get("submitter_user_id"));
        if (RdmConstants.STATUS_UAT_PENDING.equals(status)) {
            addIfPresent(receivers, row.get("acceptor_user_id"));
        }
        var requirement = requirementMapper.selectById(reqId);
        notifyService.notifyUserIds(event, requirement, receivers,
                overdue ? "需求逾期預警" : "需求即將逾期", text.toString());
    }

    private boolean alreadyNotified(Long reqId, String event) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_notify_log WHERE req_id = ? AND event_code = ? AND send_status = 'success' "
                        + "AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)",
                Integer.class, reqId, event, REMIND_INTERVAL_HOURS);
        return count != null && count > 0;
    }

    private static void addIfPresent(List<Long> list, Object value) {
        if (value != null) {
            list.add(((Number) value).longValue());
        }
    }

    private static long toLong(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private static int toInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }
}

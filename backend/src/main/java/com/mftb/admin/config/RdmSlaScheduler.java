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
        /*
         * 只能清理“本作业不负责”的陈旧标记：已实际上线或已进入终态的需求不在下面
         * 的扫描范围里，它们的 overdue_flag 永远没人归零（存量核查实测 3 条挂在风险雷达）。
         * <p>在途需求绝不在这里清：“逾期”在本作业里是按当前状态停留时长（SLA）判定的，
         * 拿计划上线日去清会和作业相互覆盖（写→刷→写），两种口径必须分开口。
         */
        int cleared = jdbcTemplate.update(
                "UPDATE rdm_requirement SET overdue_flag = 0 WHERE deleted = 0 AND overdue_flag = 1 "
                        + "AND (actual_release_date IS NOT NULL OR status IN "
                        + "('closed','verified','released','intake_rejected','rejected','on_hold'))");
        if (cleared > 0) {
            log.info("RDM 终态需求逾期标记已清理: {} 条（已上线或已终结，不再属于在途风险）", cleared);
        }
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
            boolean staleFlag = toInt(row.get("overdue_flag")) == 1;
            if (!overdue && !nearingWarn && !staleFlag) {
                continue;
            }
            Long reqId = toLong(row.get("id"));
            if (overdue && toInt(row.get("overdue_flag")) != 1) {
                jdbcTemplate.update("UPDATE rdm_requirement SET overdue_flag = 1 WHERE id = ? AND deleted = 0", reqId);
                overdueMarked++;
            }
            /*
             * SLA 已不再认为逾期时要记得归零：标记只能在“离开该状态”时被清零，
             * 但改计划日、延长 SLA 都不会触发流转，不补这一步就会一直挂着假告警。
             */
            if (!overdue && toInt(row.get("overdue_flag")) == 1) {
                jdbcTemplate.update("UPDATE rdm_requirement SET overdue_flag = 0 WHERE id = ? AND deleted = 0", reqId);
                log.info("RDM 停留已缓解，清除逾期标记: reqId={}, status={}, 停留={}h, SLA={}h",
                        reqId, status, stayed, slaHours);
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
        // 接收人：产品经理 + 研发负责人 + 提出人（验收环节加验收人）
        java.util.List<Long> receivers = new java.util.ArrayList<>();
        addIfPresent(receivers, row.get("assignee_pm_user_id"));
        addIfPresent(receivers, row.get("dev_owner_user_id"));
        addIfPresent(receivers, row.get("submitter_user_id"));
        if (RdmConstants.STATUS_UAT_PENDING.equals(status)) {
            addIfPresent(receivers, row.get("acceptor_user_id"));
        }
        if (overdue) {
            String escalate = configService.escalateRole(status, priority);
            if (StringUtils.hasText(escalate)) {
                List<Long> escalateIds = resolveRoleUsers(escalate);
                if (!escalateIds.isEmpty()) {
                    receivers.addAll(escalateIds);
                    text.append("\n\n已按規則升級提醒角色「").append(escalate)
                            .append("」，如需延期請更新計劃時間或説明阻塞原因。");
                } else {
                    /*
                     * 升级角色解析不到人时不能把「已升级」写成事实——那会让所有人以为
                     * 已经有人被通知到，而实际什么都没发生。改为在预警里说清缺口并记日志。
                     */
                    text.append("\n\n注意：升級角色「").append(escalate)
                            .append("」当前未解析到可用人員，本次升级未生效，請到需求配置或授權中心補配置。");
                    log.warn("RDM SLA 升級角色未解析到人員: role={}, reqNo={}", escalate, row.get("req_no"));
                }
            }
        }
        var requirement = requirementMapper.selectById(reqId);
        notifyService.notifyUserIds(event, requirement, receivers,
                overdue ? "需求逾期預警" : "需求即將逾期", text.toString());
    }

    /**
     * 解析升级角色的具体人员（角色编码或名称）。
     * <p>配置里的 escalate_role 历史上可能存编码也可能存名称，两者都参与匹配，
     * 避免因为写法差异默默解析为空。
     */
    private List<Long> resolveRoleUsers(String roleCodeOrName) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT u.id FROM sys_user u "
                            + "JOIN sys_role r ON JSON_VALID(u.function_roles) "
                            + "AND JSON_CONTAINS(u.function_roles, CAST(r.id AS JSON)) "
                            + "WHERE u.deleted = 0 AND u.status = 1 AND r.deleted = 0 "
                            + "AND (r.code = ? OR r.name = ?) LIMIT 20",
                    Long.class, roleCodeOrName, roleCodeOrName);
        } catch (RuntimeException e) {
            log.warn("解析升级角色失败: role={}, error={}", roleCodeOrName, e.getMessage());
            return List.of();
        }
    }

    /**
     * 同事件去重：只认「渠道已受理」（sent）。
     * <p>旧实现认 success，而旧代码只要调完 @Async 方法就记 success，
     * 等于没发出去的消息也能抑制后续 24 小时内的重试提醒。
     */
    private boolean alreadyNotified(Long reqId, String event) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_notify_log WHERE req_id = ? AND event_code = ? AND send_status = 'sent' "
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

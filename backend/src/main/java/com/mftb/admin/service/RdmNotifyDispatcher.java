package com.mftb.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 通知投递执行器：从 {@code rdm_notify_log} 领取任务 → 调渠道 → 按<b>渠道返回结果</b>落状态。
 *
 * <p>三条关键口径：
 * <ol>
 *   <li><b>sent = 渠道已受理</b>，不是「方法调用返回了」。{@code sendMarkdownSync} 返回 SendOutcome，
 *       只有 {@code channelAccepted} 才记 sent；</li>
 *   <li><b>抢占式领取</b>：用条件更新（{@code WHERE send_status IN ('pending','failed')}）代替咨询锁，
 *       多实例部署时同一个任务只会被一个执行者拿到，不依赖 GET_LOCK 与连接绑定的隐式行为；</li>
 *   <li><b>失败退避重试</b>：1 分钟、5 分钟、30 分钟、2 小时、6 小时，共 5 次；
 *       耗尽后记 abandoned 供人工补发，不静默丢弃。</li>
 * </ol>
 * <p>测试/联调环境可设 {@code rdm.notify.dry-run=true}：照常登记与流转状态，但不真发，
 * 避免把内部需求提醒推到真实群里。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmNotifyDispatcher {

    /** 最大尝试次数（含首次），耗尽后记 abandoned */
    static final int MAX_ATTEMPTS = 5;
    /** 各次失败后的重试间隔（分钟）：第 1 次失败等 1 分钟，第 4 次失败等 2 小时 */
    static final int[] BACKOFF_MINUTES = {1, 5, 30, 120, 360};

    private final DingTalkService dingTalkService;
    private final JdbcTemplate jdbcTemplate;

    @Value("${rdm.notify.dry-run:false}")
    private boolean dryRun;

    /** 提交后异步投递：外部 HTTP 不占用业务请求线程，也不在事务内持有数据库连接 */
    @Async
    public void dispatch(Long id) {
        send(id);
    }

    /**
     * 执行一条投递任务。
     * <p>可被首次发送与重试作业共用；抢不到任务时静默返回（说明另一路已在处理或已终态）。
     */
    public void send(Long id) {
        if (id == null || !claim(id)) {
            return;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT scenario, title, content, at_mobiles, attempts FROM rdm_notify_log "
                        + "WHERE id = ? AND deleted = 0", id);
        if (rows.isEmpty()) {
            log.warn("通知任務已消失但狀態為 sending: id={}", id);
            return;
        }
        Map<String, Object> row = rows.get(0);
        int attempts = row.get("attempts") == null ? 1 : ((Number) row.get("attempts")).intValue();
        String scenario = (String) row.get("scenario");
        String title = (String) row.get("title");
        String content = (String) row.get("content");
        List<String> atMobiles = splitToList((String) row.get("at_mobiles"));

        if (dryRun) {
            // 联调环境不真发，但状态照实记录为未投递，避免被误读成「已通知」
            markFinal(id, "skipped", "dry-run：開關 rdm.notify.dry-run=true，未實際發送", null);
            log.info("RDM 通知乾跑（未實際發送）: id={}, event title={}", id, title);
            return;
        }
        if (!StringUtils.hasText(content)) {
            markFinal(id, "skipped", "正文為空", null);
            return;
        }
        try {
            DingTalkService.SendOutcome outcome =
                    dingTalkService.sendMarkdownSync(scenario, title, content, atMobiles, false);
            if (outcome != null && outcome.channelAccepted()) {
                markFinal(id, "sent", null, outcome.channelName());
                return;
            }
            String error = outcome == null ? "渠道無返回結果" : outcome.errcode() + ": " + outcome.errmsg();
            retryOrAbandon(id, attempts, error, outcome == null ? null : outcome.channelName());
        } catch (RuntimeException e) {
            log.warn("RDM 通知發送異常: id={}, error={}", id, e.getMessage());
            retryOrAbandon(id, attempts, e.getMessage(), null);
        }
    }

    /**
     * 队列表不可用时的兜底：直接尝试一次发送。
     * <p>没有任务行就没有重试，只能尽力一次；调用方已记 error 日志，不会静默丢通知。
     */
    public void sendOnce(String eventCode, String scenario, String title, String text, List<String> atMobiles) {
        if (!StringUtils.hasText(text)) {
            return;
        }
        try {
            dingTalkService.sendMarkdownSync(scenario, title, text,
                    atMobiles == null ? List.of() : atMobiles, false);
        } catch (RuntimeException e) {
            log.error("RDM 通知即時嘗試也失敗（無重試憑據，請人工跟進）: event={}, error={}", eventCode, e.getMessage());
        }
    }

    /** 抢占任务：只有一个执行者能把 pending/failed 改成 sending */
    private boolean claim(Long id) {
        return jdbcTemplate.update(
                "UPDATE rdm_notify_log SET send_status = 'sending', attempts = attempts + 1, updated_at = now() "
                        + "WHERE id = ? AND deleted = 0 AND send_status IN ('pending','failed')", id) > 0;
    }

    private void retryOrAbandon(Long id, int attempts, String error, String channelName) {
        String truncated = truncate(error);
        if (attempts >= MAX_ATTEMPTS) {
            markFinal(id, "abandoned", truncated, channelName);
            log.error("RDM 通知重試耗盡，需人工補發: id={}, attempts={}, error={}", id, attempts, error);
            return;
        }
        int waitMinutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
        jdbcTemplate.update(
                "UPDATE rdm_notify_log SET send_status = 'failed', error_msg = ?, channel_name = ?, "
                        + "next_retry_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), updated_at = now() "
                        + "WHERE id = ? AND deleted = 0",
                truncated, channelName, waitMinutes, id);
        log.warn("RDM 通知未受理，{} 分鐘後重試: id={}, attempts={}, error={}", waitMinutes, id, attempts, error);
    }

    private void markFinal(Long id, String status, String error, String channelName) {
        jdbcTemplate.update(
                "UPDATE rdm_notify_log SET send_status = ?, error_msg = ?, channel_name = ?, next_retry_at = NULL, "
                        + "updated_at = now() WHERE id = ? AND deleted = 0",
                status, truncate(error), channelName, id);
    }

    private static List<String> splitToList(String value) {
        if (!StringUtils.hasText(value)) {
            return List.of();
        }
        return java.util.Arrays.stream(value.split(",")).map(String::trim)
                .filter(StringUtils::hasText).toList();
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() > 500 ? value.substring(0, 500) : value;
    }
}

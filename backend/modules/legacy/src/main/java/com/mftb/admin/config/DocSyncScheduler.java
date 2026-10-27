package com.mftb.admin.config;

import com.mftb.admin.client.TencentDocsClient;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.DocTencentSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 騰訊文檔目錄定時同步作業。
 *
 * <p>頻率預設每天 03:30 / 15:30 兩輪（錯開考勤 6/22 點同步），單輪最多 500 篇、深度 3 層，
 * 遠低於個人開發者 2000 次/天配額；可用 TENCENT_DOCS_SYNC_CRON 覆蓋。
 *
 * <p>默認關閉（sync-enabled=false）：憑據配好後在環境變量顯式開啟，
 * 避免未配置環境每次準時空轉報錯。未配置憑據時即使開關打開也直接跳過。
 *
 * <p>告警去重：access_token 有效期 30 天，過期後每輪同步都會失敗；
 * 用 sys_config 記錄最近一次告警時間做原子搶占（UPDATE 帶冷卻條件，多實例僅一個能發出），
 * 6 小時冷卻窗內不重複轟群。發送失敗只記日誌——告警是旁路，不能拖垮同步主流程。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DocSyncScheduler {

    /** 告警去重時間戳的 sys_config 鍵 */
    private static final String ALERT_DEDUP_KEY = "doc_sync_alert_last_at";
    /** 告警冷卻窗：同一故障 6 小時內只提醒一次 */
    private static final Duration ALERT_COOLDOWN = Duration.ofHours(6);
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final TencentDocsClient client;
    private final DocTencentSyncService syncService;
    private final DingTalkService dingTalkService;
    private final JdbcTemplate jdbcTemplate;

    @Value("${tencent.docs.sync-enabled:false}")
    private boolean syncEnabled;

    @Scheduled(cron = "${tencent.docs.sync-cron:0 30 3,15 * * ?}")
    public void sync() {
        if (!syncEnabled) {
            return;
        }
        if (!client.isEnabled() || !StringUtils.hasText(client.rootFolderId())) {
            log.debug("騰訊文檔定時同步已開啟但憑據/目錄未配置，跳過本輪");
            return;
        }
        try {
            DocTencentSyncService.SyncResult r = syncService.sync();
            log.info("騰訊文檔定時同步完成: created={} updated={} skipped={}", r.created(), r.updated(), r.skipped());
        } catch (Exception e) {
            log.error("騰訊文檔定時同步失敗: {}", e.getMessage());
            alertWithDedup(e.getMessage());
        }
    }

    /** 原子搶占冷卻窗：只有把時間戳從「過期」推到「現在」成功的實例才發告警 */
    private void alertWithDedup(String reason) {
        try {
            LocalDateTime now = LocalDateTime.now();
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES (?, ?, ?)",
                    ALERT_DEDUP_KEY, "", "騰訊文檔同步告警去重時間戳（ISO-8601）");
            int claimed = jdbcTemplate.update(
                    "UPDATE sys_config SET config_value = ? WHERE config_key = ? "
                            + "AND (config_value = '' OR config_value <= ?)",
                    now.format(ISO), ALERT_DEDUP_KEY, now.minus(ALERT_COOLDOWN).format(ISO));
            if (claimed == 0) {
                log.info("騰訊文檔同步告警處於冷卻窗，跳過重複發送");
                return;
            }
            if (!dingTalkService.isEnabled()) {
                log.warn("釘釘渠道未啟用，騰訊文檔同步告警僅記日誌: {}", reason);
                return;
            }
            dingTalkService.sendMarkdown("general", "⚠️ 騰訊文檔同步失敗告警",
                    "**文檔中心定時同步失敗**，請檢查 access_token 是否過期（個人開發者 token 有效期 30 天）。\n\n"
                            + "錯誤信息：" + reason + "\n\n"
                            + "處理：在騰訊文檔開放平台重置 token → 更新 `backend/.env.local` 的 `TENCENT_DOCS_ACCESS_TOKEN` → 重啟後端。",
                    null, false);
        } catch (Exception ex) {
            log.warn("發送騰訊文檔同步告警失敗: {}", ex.getMessage());
        }
    }
}

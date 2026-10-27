package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 通知底座（企業應用 + 通知場景）結構遷移：把 165 腳本納入遷移框架。
 *
 * <p><b>為什麼需要這個執行器（2026-10-14 生產發布事故）</b>：
 * {@code backend/sql/165_notification_apps_and_scenarios.sql} 長期只是手工參考腳本——
 * 沒有 catalog 版本鍵、沒有 Java 執行器、也沒有結構契約。開發庫被人手工跑過、生產 RDS 從未
 * 建過這兩張表，於是 {@code 230_meeting_core_tables.sql} 第 7 段寫 {@code sys_notification_scenario}
 * 時直接抛 {@code Table 'fengsong.sys_notification_scenario' doesn't exist}；
 * {@link SchemaVersionTracker#applyOnce} 按設計向上抛出 → 會議域 Runner 失敗 →
 * Spring 上下文啟動失敗 → Pod 崩潰循環、K8s 摘掉 Service endpoint、入口網關 503。
 *
 * <p>本執行器把建表變成「每個環境啟動都會收斂」的事實，而不是「開發庫恰好有」的僥倖。
 *
 * <p><b>啟動順序</b>：取 14——必須晚於 {@code DataInitializer(@Order 5)}（腳本要讀寫
 * {@code sys_config} 的 {@code notification_apps_migrated} 守衛鍵），並早於任何引用
 * {@code sys_notification_scenario} 的業務域（目前為 {@code MeetingSchemaMigrationInitializer(@Order 28)}）。
 * 這條順序不變量由 {@code NotificationSchemaOrderingTest} 釘住，改 {@code @Order} 前先看那個用例。
 *
 * <p>DDL 只在 classpath 腳本存一份（{@code backend/sql/} 下同名文件為參考副本，由結構鎖用例
 * 斷言逐字一致），與會議域同一套約定，避免 Java 與 SQL 雙份漂移。
 */
@Slf4j
@Component
@Order(14)
@RequiredArgsConstructor
public class NotificationSchemaMigrationInitializer implements CommandLineRunner {

    /** 一次性遷移版本鍵：記了就不再重跑，結構後續由 ContractRegistry 契約每次啟動自癒 */
    static final String VERSION_SCHEMA = "notify:schema:v1.0";

    /** 建表腳本（classpath 唯一真值） */
    static final String SCHEMA_SCRIPT = "165_notification_apps_and_scenarios.sql";

    /** 腳本必須產出的兩張表：應用憑據表 + 場景路由表 */
    static final List<String> TABLES = List.of("sys_notification_app", "sys_notification_scenario");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
    }

    /* ==================== 遷移任務 ==================== */

    private void doSchemaMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("通知底座建表腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT);
    }

    /**
     * 後置校驗：兩張表必須真的存在。
     * <p>不查列——本腳本只建表不改列，列級收斂由 {@code ContractRegistry} 的結構契約負責；
     * 校驗存在的意義是防止「語句全部執行成功但表名拼錯」這類靜默失敗被記成版本成功。
     */
    private void verifySchema() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，通知場景路由無法寫入");
            }
        }
    }

    /* ==================== 通用工具 ==================== */

    /** 逐條執行 classpath 腳本；讀不到或執行失敗一律抛出，交 applyOnce 記失敗並在下次啟動重試 */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表腳本 " + script + "，通知底座無法創建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("讀取建表腳本失敗 " + script + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        return executed;
    }

    private boolean tableExists(String table) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return n != null && n > 0;
    }
}

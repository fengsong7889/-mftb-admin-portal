package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * MCP 服務模組資料初始化器：啟動時自動建立 mcp_tool 工具註冊表並種子首批工具
 * 廣場管「接入」（安裝/卸載），AI 操作授權管「放行」（L0-L4 治理）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class McpToolDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "103_mcp_tool.sql";

    /** 外部服務種子腳本（MCP Server 接入規劃目錄） */
    private static final String EXTERNAL_SCRIPT = "104_mcp_tool_external.sql";

    /** 內置工具 Schema 升級腳本（query_batches 金額過濾參數） */
    private static final String PARAMS_SCRIPT = "105_mcp_tool_params.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("mcp_tool:" + INIT_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(INIT_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("讀取初始化腳本失敗: " + INIT_SCRIPT, e);
                }
            });
            // 外部服務遷移：補列（冪等，存在即跳過）+ 種子入庫。
            // 新增 schema 變更必須註冊為新的 applyOnce 版本，否則存量庫永不執行（schema 漂移）
            versionTracker.applyOnce("mcp_tool:mcp-tool-external:v1", () -> {
                addColumnIfAbsent("source",
                        "VARCHAR(16) NOT NULL DEFAULT 'builtin' COMMENT '工具來源: builtin=內置工具 external=外部服務(MCP Server)'");
                addColumnIfAbsent("transport",
                        "VARCHAR(32) NULL COMMENT '外部服務接入方式: remote-http / remote-sse / local-stdio（builtin 為 NULL）'");
                try {
                    executeSqlScript(EXTERNAL_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("讀取初始化腳本失敗: " + EXTERNAL_SCRIPT, e);
                }
            });
            // 內置工具 Schema 升級：冪等 UPDATE，新增必須註冊新版本否則存量庫永不執行
            versionTracker.applyOnce("mcp_tool:mcp-tool-params:v1", () -> {
                try {
                    executeSqlScript(PARAMS_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("讀取初始化腳本失敗: " + PARAMS_SCRIPT, e);
                }
            });
        } catch (Exception e) {
            log.error("MCP 工具註冊表建立失敗: {}", e.getMessage(), e);
        }
    }

    /** 列存在性判定後補列（INFORMATION_SCHEMA 判定，與 DataInitializer.addColumnIfAbsent 模式一致） */
    private void addColumnIfAbsent(String column, String definition) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mcp_tool' AND COLUMN_NAME = ?",
                Integer.class, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute("ALTER TABLE mcp_tool ADD COLUMN " + column + " " + definition);
            log.info("mcp_tool 補列完成: {}", column);
        }
    }

    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳過初始化", scriptName);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已執行 {} — MCP 工具註冊表建立完成", scriptName);
        }
    }
}

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
 * MCP 服务模组资料初始化器：启动时自动建立 mcp_tool 工具注册表并种子首批工具
 * 广场管「接入」（安装/卸载），AI 操作授权管「放行」（L0-L4 治理）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class McpToolDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "103_mcp_tool.sql";

    /** 外部服务种子脚本（MCP Server 接入规划目录） */
    private static final String EXTERNAL_SCRIPT = "104_mcp_tool_external.sql";

    /** 内置工具 Schema 升级脚本（query_batches 金额过滤参数） */
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
            // 外部服务迁移：补列（幂等，存在即跳过）+ 种子入库。
            // 新增 schema 变更必须注册为新的 applyOnce 版本，否则存量库永不执行（schema 漂移）
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
            // 内置工具 Schema 升级：幂等 UPDATE，新增必须注册新版本否则存量库永不执行
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

    /** 列存在性判定后补列（INFORMATION_SCHEMA 判定，与 DataInitializer.addColumnIfAbsent 模式一致） */
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

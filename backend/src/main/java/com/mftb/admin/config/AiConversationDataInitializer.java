package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * AI 助手会话表资料初始化器：启动时自动建立 ai_conversation 表并写入最大会话数配置
 * 使用 JdbcTemplate 直接操作，避免 SQL 文件找不到或解析问题
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(10)
public class AiConversationDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("ai_conversation:v2", () -> {
                // 1. 建表
                jdbcTemplate.execute(
                        "CREATE TABLE IF NOT EXISTS ai_conversation ("
                                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                                + "username VARCHAR(64) NOT NULL COMMENT '用戶帳號', "
                                + "title VARCHAR(200) NOT NULL DEFAULT '新對話' COMMENT '會話標題', "
                                + "messages MEDIUMTEXT NOT NULL COMMENT '消息列表 JSON', "
                                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                                + "deleted TINYINT NOT NULL DEFAULT 0, "
                                + "INDEX idx_username_updated (username, updated_at DESC)"
                                + ") COMMENT 'AI 助手會話'");
                log.info("已建立 ai_conversation 表");

                // 2. 写入最大会话数配置
                try {
                    jdbcTemplate.update(
                            "INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES ('ai_max_conversations', '50', '每個用戶最大 AI 會話數')");
                } catch (Exception e) {
                    log.warn("寫入 ai_max_conversations 配置失敗（可忽略）: {}", e.getMessage());
                }
            });

            // v3: 新增审计字段（model_key / total_tokens / request_count）
            versionTracker.applyOnce("ai_conversation:v3", () -> {
                addColumnIfAbsent("ai_conversation", "model_key", "VARCHAR(64) DEFAULT NULL COMMENT '本次會話使用的模型標識'");
                addColumnIfAbsent("ai_conversation", "total_tokens", "INT DEFAULT 0 COMMENT '本次會話累計消耗 tokens'");
                addColumnIfAbsent("ai_conversation", "request_count", "INT DEFAULT 0 COMMENT '本次會話累計請求次數'");
                log.info("ai_conversation 審計字段補齊完成");
            });

            // v4: 新增回收站支持（deleted_at 列）
            versionTracker.applyOnce("ai_conversation:v4", () -> {
                addColumnIfAbsent("ai_conversation", "deleted_at", "DATETIME DEFAULT NULL COMMENT '刪除時間戳'");
                log.info("ai_conversation 回收站字段補齊完成");
            });
        } catch (Exception e) {
            log.error("AI助手會話表初始化失敗: {}", e.getMessage(), e);
        }
    }

    /** 安全补列：已存在则跳过，避免重复执行报错（MySQL 兼容） */
    private void addColumnIfAbsent(String table, String column, String definition) {
        try {
            // 先检查列是否已存在
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, table, column);
            if (count != null && count > 0) {
                log.info("列 {}.{} 已存在，跳過", table, column);
                return;
            }
            // 列不存在，执行新增
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("已新增列 {}.{}", table, column);
        } catch (Exception e) {
            log.warn("補列 {}.{} 失敗: {}", table, column, e.getMessage());
        }
    }
}

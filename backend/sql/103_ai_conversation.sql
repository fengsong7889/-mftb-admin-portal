-- 103_ai_conversation.sql
-- AI 助手会话持久化表：存储用户的多轮对话历史，支持多窗口会话管理

CREATE TABLE IF NOT EXISTS ai_conversation (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(64)  NOT NULL COMMENT '用戶帳號',
    title       VARCHAR(200) NOT NULL DEFAULT '新對話' COMMENT '會話標題',
    messages    MEDIUMTEXT   NOT NULL COMMENT '消息列表 JSON',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted     TINYINT      NOT NULL DEFAULT 0,
    INDEX idx_username_updated (username, updated_at DESC)
) COMMENT 'AI 助手會話';

-- 每个用户最大会话数配置
INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('ai_max_conversations', '50', '每個用戶最大 AI 會話數');

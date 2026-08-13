-- 38_sys_config.sql
-- 系统配置表：通用 key-value 存储，供后端动态读取系统级配置（如空闲超时时间）
-- 规则配置页面保存时通过 API 同步写入此表，后端服务从 DB 读取而非环境变量

CREATE TABLE IF NOT EXISTS sys_config (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_key  VARCHAR(100)  NOT NULL UNIQUE COMMENT '配置项唯一标识（如 session_idle_timeout_ms）',
    config_value VARCHAR(500) NOT NULL COMMENT '配置值',
    description VARCHAR(200)  DEFAULT NULL COMMENT '配置说明',
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT '系统配置表（通用 key-value 存储）';

-- 默认空闲超时 60 分钟（与原有环境变量默认值保持一致）
-- 使用 INSERT IGNORE 避免重复执行时报 Duplicate entry 错误
INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('session_idle_timeout_ms', '3600000', '会话空闲超时时间（毫秒），默认60分钟，管理员可在规则配置中修改');

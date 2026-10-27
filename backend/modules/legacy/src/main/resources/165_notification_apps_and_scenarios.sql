-- 企业应用与通知场景分离；与群机器人配置独立，幂等执行，不覆盖已有配置。
CREATE TABLE IF NOT EXISTS sys_notification_app (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '应用名称',
    platform VARCHAR(20) NOT NULL DEFAULT 'dingtalk',
    app_key VARCHAR(100) NOT NULL,
    app_secret VARCHAR(256) NOT NULL DEFAULT '',
    agent_id VARCHAR(32) NOT NULL DEFAULT '',
    base_url VARCHAR(500) NOT NULL DEFAULT '',
    enabled TINYINT NOT NULL DEFAULT 1,
    remark VARCHAR(500) NOT NULL DEFAULT '',
    legacy_key VARCHAR(50) DEFAULT NULL COMMENT '旧配置迁移标记',
    updated_by VARCHAR(100) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_notification_app_key (app_key),
    UNIQUE KEY uk_notification_app_legacy (legacy_key)
) COMMENT='企业内部应用（凭据每应用保存一次）';

CREATE TABLE IF NOT EXISTS sys_notification_scenario (
    scenario_key VARCHAR(64) PRIMARY KEY,
    app_id BIGINT DEFAULT NULL,
    enabled TINYINT NOT NULL DEFAULT 0,
    updated_by VARCHAR(100) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_scenario_app FOREIGN KEY (app_id) REFERENCES sys_notification_app(id)
) COMMENT='业务通知场景路由，场景定义与接收人规则由业务代码声明';

-- 只迁移一次；保留旧配置和签署密钥，既有免登签署链接继续有效。
INSERT INTO sys_notification_app
    (name, app_key, app_secret, agent_id, base_url, enabled, legacy_key, updated_by)
SELECT '原企業通知應用', c.app_key, c.app_secret, c.agent_id, c.base_url,
    CASE WHEN c.app_key <> '' AND c.app_secret <> '' AND c.agent_id <> '' AND c.base_url <> '' THEN 1 ELSE 0 END,
    'dingtalk_singleton', '系統遷移'
FROM (
    SELECT COALESCE(MAX(CASE WHEN config_key = 'dingtalk_app_key' THEN config_value END), '') AS app_key,
           COALESCE(MAX(CASE WHEN config_key = 'dingtalk_app_secret' THEN config_value END), '') AS app_secret,
           COALESCE(MAX(CASE WHEN config_key = 'dingtalk_agent_id' THEN config_value END), '') AS agent_id,
           COALESCE(MAX(CASE WHEN config_key = 'dingtalk_notify_base_url' THEN config_value END), '') AS base_url
    FROM sys_config
) c
WHERE (c.app_key <> '' OR c.app_secret <> '' OR c.agent_id <> '' OR c.base_url <> '')
  AND NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'notification_apps_migrated')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by)
SELECT 'asset_claim_sign', a.id, COALESCE(a.enabled, 0), '系統遷移'
FROM (SELECT 1 AS seed) s
LEFT JOIN sys_notification_app a ON a.legacy_key = 'dingtalk_singleton'
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_scenario WHERE scenario_key = 'asset_claim_sign');

INSERT INTO sys_config (config_key, config_value)
VALUES ('notification_apps_migrated', 'true')
ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);

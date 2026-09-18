-- ============================================================
-- 162_notification_channel_refactor.sql
-- 通知渠道多场景配置改造：新建 sys_notification_channel 表
-- 从 sys_config 迁移旧钉钉配置数据
-- 幂等脚本，可重复执行
-- ============================================================

-- 1. 新建通知渠道配置表
CREATE TABLE IF NOT EXISTS sys_notification_channel (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '渠道名称，如「默认群」「OA审批群」',
  channel VARCHAR(20) NOT NULL COMMENT '平台类型：dingtalk / wecom / feishu',
  webhook_url VARCHAR(500) NOT NULL COMMENT 'Webhook 地址',
  secret VARCHAR(200) DEFAULT '' COMMENT '加签密钥',
  at_mobiles VARCHAR(500) DEFAULT '' COMMENT '默认@手机号（逗号分隔）',
  enabled TINYINT DEFAULT 1 COMMENT '是否启用 0/1',
  is_default TINYINT DEFAULT 1 COMMENT '是否为该平台的默认渠道（fallback用）',
  scenarios VARCHAR(500) DEFAULT '' COMMENT '绑定场景标识（逗号分隔），如 oa_approval,ai_assistant',
  remark VARCHAR(500) DEFAULT '' COMMENT '备注',
  created_by VARCHAR(50) DEFAULT '',
  updated_by VARCHAR(50) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted TINYINT DEFAULT 0,
  INDEX idx_channel (channel, deleted),
  INDEX idx_scenario (scenarios(100), deleted)
) COMMENT='通知渠道配置表（支持多场景）';

-- 2. 从 sys_config 迁移旧钉钉配置到新表（仅当新表为空且旧配置有 webhook 时执行）
INSERT INTO sys_notification_channel (name, channel, webhook_url, secret, at_mobiles, enabled, is_default, scenarios, created_by, updated_by)
SELECT '默認釘釘群', 'dingtalk',
       (SELECT config_value FROM sys_config WHERE config_key = 'dingtalk_webhook_url' AND config_value != ''),
       (SELECT config_value FROM sys_config WHERE config_key = 'dingtalk_secret'),
       (SELECT config_value FROM sys_config WHERE config_key = 'dingtalk_at_mobiles'),
       (SELECT CASE WHEN config_value = 'true' THEN 1 ELSE 0 END FROM sys_config WHERE config_key = 'dingtalk_enabled'),
       1, '', 'system', 'system'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_channel WHERE channel = 'dingtalk' AND deleted = 0)
  AND EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'dingtalk_webhook_url' AND config_value != '');

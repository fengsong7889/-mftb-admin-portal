-- ============================================================
-- 124_dingtalk_notification.sql
-- 钉钉机器人 Webhook 通知：sys_config 种子 + mcp_tool 种子
-- 幂等脚本，可重复执行
-- ============================================================

-- 1. 钉钉通知 sys_config 种子数据
INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('dingtalk_webhook_url', '', '钉钉自定义机器人 Webhook 地址');

INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('dingtalk_secret', '', '钉钉自定义机器人加签密钥（SEC 开头）');

INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('dingtalk_enabled', 'false', '钉钉通知全局开关（true/false）');

INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('dingtalk_at_mobiles', '', '钉钉通知默认 @手机号列表（逗号分隔）');

-- 2. 钉钉发送 MCP 工具种子（dingtalk_sender）
INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, source, transport, sort, deleted)
SELECT 'dingtalk_sender', '釘釘通知', 'notify',
       '通過釘釘自定義機器人 Webhook 向群聊發送消息（支持文本和 Markdown 格式），適用於將查詢結果或審批提醒推送至釘釘群',
       'BellOutlined', '1.0.0', 'L3',
       '{"type":"object","properties":{"content":{"type":"string","description":"要發送的消息內容"},"msgType":{"type":"string","description":"消息類型：text 或 markdown（默認 markdown）"},"atMobiles":{"type":"string","description":"@指定手機號（逗號分隔，可選）"}},"required":["content"]}',
       1, 0, 'external', 'remote-http', 104, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'dingtalk_sender');

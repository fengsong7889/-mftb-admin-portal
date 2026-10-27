-- ============================================================
-- 271_ai_notification_scenario.sql
-- 註冊 AI 助手個人推送場景（預設不綁定應用、不啟用；由管理員在通知配置頁綁定）
-- 冪等：ON DUPLICATE KEY UPDATE 僅保留原值
-- ============================================================

INSERT INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by)
VALUES ('ai_assistant_work', NULL, 0, 'system')
ON DUPLICATE KEY UPDATE scenario_key = VALUES(scenario_key);

-- ============================================================
-- 277_ai_config_ops.sql（参考文档，实际执行体为 classpath 同名脚本）
-- AI 助手配置中心收尾批：ai_runtime_setting 表 + 记忆策略默认值 + 快捷提问种子
-- 推送模板不种子化：内置模板以 Java 默认值为准，配置页可“還原內置模板”。
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_runtime_setting (
  setting_key VARCHAR(64) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  value_type VARCHAR(16) NOT NULL DEFAULT 'int' COMMENT 'int/bool/string',
  remark VARCHAR(255) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手运行参数（运营可调，安全阈值不在其中）';

INSERT IGNORE INTO ai_runtime_setting (setting_key, setting_value, value_type, remark, updated_by) VALUES
  ('memory.max_count', '50', 'int', '單個員工最多保存多少條記憶', 'system'),
  ('memory.retention_days', '180', 'int', '記憶保留天數，到期自動失效', 'system'),
  ('memory.prompt_top', '10', 'int', '每次回答最多注入多少條相關記憶', 'system'),
  ('memory.auto_suggest', '1', 'bool', '是否從用戶消息給出「記住這條」建議（0=關閉）', 'system');

INSERT IGNORE INTO ai_quick_prompt (domain, system_code, role_code, question, sort, enabled, updated_by) VALUES
  ('common', NULL, NULL, '目前有哪些進行中的項目？', 10, 1, 'system'),
  ('common', NULL, NULL, '待我審批和待分配的需求有哪些？', 20, 1, 'system'),
  ('common', NULL, NULL, '團隊成員目前各自在做什麼？', 30, 1, 'system'),
  ('common', NULL, NULL, '把某個項目的進度發到釘釘群', 40, 1, 'system');

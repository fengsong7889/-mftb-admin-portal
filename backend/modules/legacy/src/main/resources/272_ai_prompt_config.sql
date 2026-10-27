-- ============================================================
-- 272_ai_prompt_config.sql
-- AI 助手配置中心：能力清单 / 回答骨架 / 术语口径 / 快捷提问 / 推送模板 / 变更审计
-- 冪等：CREATE TABLE IF NOT EXISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_prompt_profile (
  id BIGINT NOT NULL AUTO_INCREMENT,
  profile_key VARCHAR(64) NOT NULL COMMENT 'global / rdm / finance / eam / hr',
  name VARCHAR(128) NOT NULL,
  domain VARCHAR(32) NOT NULL DEFAULT 'global' COMMENT 'global 或系统编码',
  response_skeleton TEXT NOT NULL COMMENT '回答骨架（Markdown 指令）',
  extra_rules TEXT DEFAULT NULL COMMENT '领域补充规则',
  status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/active/archived',
  active_flag TINYINT DEFAULT NULL COMMENT 'active 行=1，其余 NULL',
  version INT NOT NULL DEFAULT 1,
  published_at DATETIME DEFAULT NULL,
  published_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_profile_version (profile_key, version),
  UNIQUE KEY uk_profile_active (profile_key, active_flag),
  KEY idx_profile_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手回答骨架/领域规则（版本化）';

CREATE TABLE IF NOT EXISTS ai_capability (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tool_key VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  domain VARCHAR(32) NOT NULL DEFAULT 'common',
  prompt_description TEXT NOT NULL COMMENT '下发给模型的 function description',
  use_when VARCHAR(512) DEFAULT NULL,
  avoid_when VARCHAR(512) DEFAULT NULL,
  examples_json TEXT DEFAULT NULL,
  sort INT NOT NULL DEFAULT 0,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_capability_tool (tool_key),
  KEY idx_capability_domain (domain, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 能力清单（prompt 元数据，启停仍在 ai_tool_policy）';

CREATE TABLE IF NOT EXISTS ai_glossary (
  id BIGINT NOT NULL AUTO_INCREMENT,
  domain VARCHAR(32) NOT NULL DEFAULT 'common',
  term VARCHAR(128) NOT NULL,
  aliases VARCHAR(512) DEFAULT NULL,
  definition TEXT NOT NULL,
  formula VARCHAR(512) DEFAULT NULL,
  example VARCHAR(512) DEFAULT NULL,
  prompt_visible TINYINT NOT NULL DEFAULT 1,
  source VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT 'system/manual',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort INT NOT NULL DEFAULT 0,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_glossary_domain_term (domain, term),
  KEY idx_glossary_prompt (prompt_visible, status, domain, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 术语/口径字典';

CREATE TABLE IF NOT EXISTS ai_quick_prompt (
  id BIGINT NOT NULL AUTO_INCREMENT,
  domain VARCHAR(32) NOT NULL DEFAULT 'common',
  system_code VARCHAR(32) DEFAULT NULL,
  role_code VARCHAR(64) DEFAULT NULL,
  question VARCHAR(512) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  enabled TINYINT NOT NULL DEFAULT 1,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quick_prompt_scope (system_code, domain, enabled, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手快捷提问';

CREATE TABLE IF NOT EXISTS ai_push_template (
  id BIGINT NOT NULL AUTO_INCREMENT,
  template_key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  target_type VARCHAR(16) NOT NULL COMMENT 'group/person',
  title_tpl VARCHAR(255) NOT NULL,
  content_tpl TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_push_template_key (template_key),
  KEY idx_push_template_target (target_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 推送模板（项目进度群/个人两版）';

CREATE TABLE IF NOT EXISTS ai_config_change_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  config_type VARCHAR(32) NOT NULL COMMENT 'capability/prompt/glossary/quick_prompt/push_template',
  config_key VARCHAR(128) NOT NULL,
  action VARCHAR(16) NOT NULL COMMENT 'create/update/publish/rollback/delete',
  before_json TEXT DEFAULT NULL,
  after_json TEXT DEFAULT NULL,
  operator VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_config_log_type (config_type, created_at),
  KEY idx_config_log_operator (operator, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 配置变更审计';

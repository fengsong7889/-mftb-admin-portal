-- ============================================================
-- 274_ai_phase3.sql
-- AI 助手三期：RAG 知识库（文档/分块）+ 敏感词/合规护栏 + 知识库检索工具注册
-- 说明：全文索引由 Java 迁移按能力探测后创建（ngram 不可用时降级），不放在本脚本，
--       避免低版本/非 MySQL 环境因 WITH PARSER ngram 整段失败。
-- 脚本必须幂等：只 CREATE IF NOT EXISTS / INSERT IGNORE。
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_knowledge_doc (
  id BIGINT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL COMMENT '文档标题',
  system_code VARCHAR(32) NOT NULL DEFAULT 'common' COMMENT '归属系统 common/rdm/finance/eam/hr',
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'manual/url/file',
  content MEDIUMTEXT NOT NULL COMMENT '原文',
  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  chunk_count INT NOT NULL DEFAULT 0 COMMENT '分块数',
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_knowledge_doc_status (system_code, status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 知识库文档';

CREATE TABLE IF NOT EXISTS ai_knowledge_chunk (
  id BIGINT NOT NULL AUTO_INCREMENT,
  doc_id BIGINT NOT NULL,
  chunk_no INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_knowledge_chunk (doc_id, chunk_no),
  KEY idx_ai_knowledge_chunk_doc (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 知识库分块（检索单元）';

CREATE TABLE IF NOT EXISTS ai_guard_rule (
  id BIGINT NOT NULL AUTO_INCREMENT,
  rule_type VARCHAR(16) NOT NULL DEFAULT 'keyword' COMMENT 'keyword/regex',
  pattern VARCHAR(500) NOT NULL COMMENT '关键词或正则',
  action VARCHAR(16) NOT NULL DEFAULT 'warn' COMMENT 'block/warn/replace',
  scope VARCHAR(16) NOT NULL DEFAULT 'both' COMMENT 'input/output/both',
  replacement VARCHAR(200) DEFAULT NULL COMMENT 'replace 动作的替换文本',
  enabled TINYINT NOT NULL DEFAULT 1,
  remark VARCHAR(200) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_guard_rule (rule_type, pattern, scope),
  KEY idx_ai_guard_rule_enabled (enabled, scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 输入/输出合规护栏';

INSERT IGNORE INTO mcp_tool (tool_key, name, category, description, version, risk_level, params_json, enabled, installed, installed_by, sort, source)
VALUES ('search_knowledge', '知識庫檢索', 'ai',
        '檢索管理後台知識庫（使用說明、RDM 流程規範、字段口徑），回答時引用標題與片段',
        '1.0.0', 'L1',
        '{"type":"object","properties":{"query":{"type":"string","description":"檢索關鍵詞或問題"},"systemCode":{"type":"string","description":"可選：限定系統 common/rdm/finance/eam/hr"},"limit":{"type":"integer","description":"返回條數，默認 5，最多 10"}},"required":["query"]}',
        1, 1, 'system', 90, 'builtin');

INSERT IGNORE INTO ai_tool_policy (tool_key, enabled, risk_level, require_approval, remark, updated_by)
VALUES ('search_knowledge', 1, 'low', 0, 'RAG 知识库检索（只读）', 'system');

INSERT IGNORE INTO ai_capability (tool_key, display_name, domain, prompt_description, use_when, avoid_when, examples_json, sort, updated_by)
VALUES ('search_knowledge', '知識庫檢索', 'common',
        '檢索管理後台知識庫中的規範與口徑，返回文檔標題與相關片段。',
        '用戶詢問操作說明、流程規範、字段口徑，或業務數據查詢需要先確認定義時。',
        '能直接用業務工具查到的事實不要先查知識庫；知識庫為空時如實說明。',
        '["RDM 需求準入的規則是什麼？","日報推送怎麼配置？"]',
        90, 'system');

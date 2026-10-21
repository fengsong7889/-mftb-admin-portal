-- ============================================================
-- 274_ai_phase3.sql（参考文档，实际执行体为 classpath 同名脚本）
-- AI 助手三期：ai_knowledge_doc / ai_knowledge_chunk / ai_guard_rule
-- search_knowledge 工具注册（mcp_tool + ai_tool_policy + ai_capability）
-- 全文索引由 AiAssistantPhase3SchemaInitializer 探测后创建（ngram 不可用时降级普通索引）
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_knowledge_doc (
  id BIGINT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL COMMENT '文档标题',
  system_code VARCHAR(32) NOT NULL DEFAULT 'common' COMMENT '归属系统',
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'manual/url/file',
  content MEDIUMTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  chunk_count INT NOT NULL DEFAULT 0,
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
  UNIQUE KEY uk_ai_knowledge_chunk (doc_id, chunk_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 知识库分块';

CREATE TABLE IF NOT EXISTS ai_guard_rule (
  id BIGINT NOT NULL AUTO_INCREMENT,
  rule_type VARCHAR(16) NOT NULL DEFAULT 'keyword',
  pattern VARCHAR(500) NOT NULL,
  action VARCHAR(16) NOT NULL DEFAULT 'warn',
  scope VARCHAR(16) NOT NULL DEFAULT 'both',
  replacement VARCHAR(200) DEFAULT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  remark VARCHAR(200) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_guard_rule (rule_type, pattern, scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 输入/输出合规护栏';

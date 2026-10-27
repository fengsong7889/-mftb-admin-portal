-- ============================================================
-- 273_ai_assistant_phase2.sql
-- AI 助手二期：短期摘要列（由 Java 迁移逐列 ADD）+ 长期记忆表 + 回答反馈表
-- 冪等：CREATE TABLE IF NOT EXISTS；ai_conversation 的三列由初始化器先查 INFORMATION_SCHEMA 再 ADD
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_user_memory (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL COMMENT '所属员工 sys_user.id',
  memory_type VARCHAR(16) NOT NULL DEFAULT 'preference' COMMENT 'preference/fact/instruction',
  content VARCHAR(500) NOT NULL COMMENT '用户可读的记忆内容',
  content_hash CHAR(64) NOT NULL COMMENT 'SHA-256(content)，用于同用户去重',
  source VARCHAR(16) NOT NULL DEFAULT 'explicit' COMMENT 'explicit/auto',
  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  expires_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_memory (user_id, content_hash),
  KEY idx_user_memory_active (user_id, status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手长期记忆（按用户隔离）';

CREATE TABLE IF NOT EXISTS ai_feedback (
  id BIGINT NOT NULL AUTO_INCREMENT,
  conversation_pk BIGINT DEFAULT NULL,
  message_id VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  rating TINYINT NOT NULL COMMENT '1=赞 -1=踩',
  reason VARCHAR(64) DEFAULT NULL COMMENT '答非所问/数据不对/太啰嗦/权限提示不清',
  answer_preview VARCHAR(500) DEFAULT NULL,
  tool_keys VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_feedback_user_message (user_id, message_id),
  KEY idx_ai_feedback_rating (rating, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 回答反馈';

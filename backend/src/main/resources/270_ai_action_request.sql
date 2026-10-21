-- ============================================================
-- 270_ai_action_request.sql
-- AI 助手待確認動作（推送等寫操作）
-- 狀態機：pending → processing → sent / failed；pending → cancelled / expired
-- 冪等：CREATE TABLE IF NOT EXISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_action_request (
  id BIGINT NOT NULL AUTO_INCREMENT,
  action_type VARCHAR(32) NOT NULL COMMENT '動作類型: rdm_progress_group / rdm_progress_person / user_memory_save',
  conversation_pk BIGINT DEFAULT NULL COMMENT '關聯會話主鍵',
  operator VARCHAR(64) NOT NULL COMMENT '發起人賬號（工號）',
  payload_json JSON NOT NULL COMMENT '凍結的發送參數（projectId/targetType/recipientUserId/title/content）',
  preview_text TEXT NOT NULL COMMENT '確認卡預覽文本',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/processing/sent/failed/cancelled/expired',
  expires_at DATETIME NOT NULL COMMENT '確認有效期',
  executed_at DATETIME DEFAULT NULL COMMENT '確認/失敗/取消時間',
  result_message VARCHAR(1000) DEFAULT NULL COMMENT '結果或失敗原因',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_action_operator_status (operator, status, created_at),
  KEY idx_ai_action_conversation (conversation_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手待確認動作（推送等寫操作）';

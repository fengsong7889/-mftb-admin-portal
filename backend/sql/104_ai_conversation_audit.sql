-- 104_ai_conversation_audit.sql
-- AI 会话审计：扩展 ai_conversation 表，增加模型与 tokens 字段，便于审计追溯

-- 新增字段
ALTER TABLE ai_conversation
    ADD COLUMN IF NOT EXISTS model_key VARCHAR(64) DEFAULT NULL COMMENT '本次会话使用的模型标识（AUTO 时记录实际路由模型）',
    ADD COLUMN IF NOT EXISTS total_tokens INT DEFAULT 0 COMMENT '本次会话累计消耗 tokens（输入+输出）',
    ADD COLUMN IF NOT EXISTS request_count INT DEFAULT 0 COMMENT '本次会话累计请求次数';

-- 新增索引：按 username + created_at 降序，便于审计分页查询
CREATE INDEX IF NOT EXISTS idx_conv_username_created ON ai_conversation(username, created_at DESC);
-- 新增索引：按 model_key 筛选
CREATE INDEX IF NOT EXISTS idx_conv_model_key ON ai_conversation(model_key);

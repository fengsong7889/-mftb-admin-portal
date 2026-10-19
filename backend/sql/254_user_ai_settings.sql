-- 254: 个人工作台 AI 设置持久化
-- sys_user.ai_settings 列：存储用户 AI 助手偏好设置（引擎模式、上下文窗口、思考模式等），JSON 格式。
-- 前端 Home 页面加载时从后端读取，用户修改后回写，替代原先仅存 localStorage 导致刷新丢失的问题。
-- 与 quick_favorites / portal_favorites 分列：三者语义不同，整份覆盖写入，共用会互相抹掉。

ALTER TABLE sys_user
  ADD COLUMN ai_settings TEXT NULL
  COMMENT 'AI 助手偏好设置，JSON 格式如 {"engineMode":"auto","contextWindow":128000,"thinkingEnabled":false,"thinkingDepth":"xhigh"}';

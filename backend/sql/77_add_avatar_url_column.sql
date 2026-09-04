-- ============================================================
-- 77. 添加用户头像 URL 字段（支持在线头像）
-- ============================================================
-- 用途：增加 avatar_url 字段用于存储用户选择的在线头像 URL（IconFont、DiceBear 等外部 URL）
--      avatar 字段保留用于本地 base64 或 pikachu 标识
--      当 avatar_url 存在且为有效 URL 时优先使用，否则降级到 avatar 字段
-- ============================================================

ALTER TABLE sys_user 
ADD COLUMN avatar_url VARCHAR(512) COMMENT '用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL）' AFTER avatar;

-- 迁移现有数据：将现有的远程头像 URL 从 avatar 迁移到 avatar_url
UPDATE sys_user SET avatar_url = avatar WHERE avatar IS NOT NULL AND (avatar LIKE 'https://%' OR avatar LIKE 'http://%');

-- 检查是否成功（可选执行）
SELECT username, avatar, avatar_url FROM sys_user WHERE avatar_url IS NOT NULL LIMIT 10;

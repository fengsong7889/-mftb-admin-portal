# ============================================================
# 数据库迁移：添加 avatar_url 字段到 sys_user 表
# ============================================================

-- 方式一：通过命令行直接执行（推荐）
# mysql -h localhost -P 3306 -u root -p your_database < /Users/yangjingjing/Desktop/SRAS/backend/sql/77_add_avatar_url_column.sql

-- 方式二：在 MySQL 客户端中直接复制粘贴执行以下 SQL：

ALTER TABLE sys_user 
ADD COLUMN avatar_url VARCHAR(512) COMMENT '用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL）' AFTER avatar;

-- 迁移现有数据：将现有的远程头像 URL 从 avatar 迁移到 avatar_url
UPDATE sys_user SET avatar_url = avatar WHERE avatar IS NOT NULL AND (avatar LIKE 'https://%' OR avatar LIKE 'http://%');

-- 检查是否成功（可选执行）
SELECT username, avatar, avatar_url FROM sys_user WHERE avatar_url IS NOT NULL LIMIT 10;

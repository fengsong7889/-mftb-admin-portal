-- ============================================================
-- 163: 钉钉企业内部应用 + 资产领用签署链接
-- 1) sys_user 增加 dingtalk_user_id 字段（员工与钉钉账号绑定）
-- 2) sys_config 写入钉钉企业内部应用配置键（管理员按需填写真实值）
-- ============================================================

-- 1. sys_user 增加 dingtalk_user_id（幂等：先查 information_schema 再 ALTER）
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sys_user'
    AND COLUMN_NAME = 'dingtalk_user_id'
);
SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE sys_user ADD COLUMN dingtalk_user_id VARCHAR(64) DEFAULT NULL COMMENT ''钉钉用户ID（工作通知定向推送用）'' AFTER native_place',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. sys_config 钉钉企业内部应用配置（值留空，管理员在数据库/后续配置页填写）
--    dingtalk_app_key / dingtalk_app_secret / dingtalk_agent_id
--    dingtalk_notify_base_url：签署页外链地址（如 https://admin.example.com）
INSERT INTO sys_config (config_key, config_value, description, created_at, updated_at)
SELECT k.ck, k.cv, k.cd, NOW(), NOW()
FROM (
  SELECT 'dingtalk_app_key'        AS ck, '' AS cv, '钉钉企业内部应用 AppKey' AS cd UNION ALL
  SELECT 'dingtalk_app_secret',     '',     '钉钉企业内部应用 AppSecret' UNION ALL
  SELECT 'dingtalk_agent_id',       '',     '钉钉企业内部应用 AgentId（发送工作通知使用）' UNION ALL
  SELECT 'dingtalk_notify_base_url','',     '钉钉签署链接跳转的前端基础地址（如 https://admin.example.com）'
) k
WHERE NOT EXISTS (
  SELECT 1 FROM sys_config sc WHERE sc.config_key = k.ck
);

-- 3. 钉钉签署令牌密钥（HMAC），默认随机生成，仅首次插入
SET @token_secret_exists = (
  SELECT COUNT(*) FROM sys_config WHERE config_key = 'dingtalk_sign_token_secret'
);
SET @gen_secret = IF(@token_secret_exists = 0,
  'INSERT INTO sys_config (config_key, config_value, description, created_at, updated_at) VALUES (''dingtalk_sign_token_secret'', SHA2(CONCAT(RAND(), UUID(), NOW()), 256), ''领用签署链接令牌签名密钥（勿外泄）'', NOW(), NOW())',
  'SELECT 1');
PREPARE stmt2 FROM @gen_secret;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ============================================================
-- 67_sys_config_value_len.sql
-- 加宽 sys_config.config_value：AI 模型账号白名单需要存较长的账号列表
-- 原 VARCHAR(500) 约只能容纳 45 个账号，超限会被 MySQL 严格模式拒绝，
-- 导致「规则配置 → AI 模型权限规则」保存后跨账号不生效。
-- 同时预注册两条 AI 模型权限配置（值为 JSON 账号数组，[] = 全部账号可用），
-- 便于 DBA 识别含义；前端保存走 UPSERT，不依赖这两条种子存在。
-- 幂等：仅当列当前宽度 < 2000 时执行 ALTER
-- ============================================================

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_config'
              AND COLUMN_NAME = 'config_value' AND CHARACTER_MAXIMUM_LENGTH < 2000),
    'ALTER TABLE sys_config MODIFY COLUMN config_value VARCHAR(2000) NOT NULL COMMENT ''配置值''',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 预注册 AI 模型账号白名单（INSERT IGNORE 避免重复执行报错）
INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
    ('ai_model_qw_accounts', '[]', 'QW模型(阿里百炼)可用登录账号, JSON数组, []表示全部账号可用'),
    ('ai_model_ds_accounts', '[]', 'DS模型(DeepSeek)可用登录账号, JSON数组, []表示全部账号可用');

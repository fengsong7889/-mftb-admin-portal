-- ============================================================
-- 66_fin_risk_config_status.sql
-- 消费风控改为登记制: 新增 status 列 (enabled=启用 / disabled=停用)
-- 语义: 未登记 / 停用 / 白名单豁免 的集团均不限制消费；
--       仅「已登记 + 启用 + pool/fixed 模式」的集团受限额管控。
-- 幂等: 仅当表存在且列缺失时执行 ALTER
-- ============================================================

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config')
    AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config' AND COLUMN_NAME = 'status'),
    'ALTER TABLE biz_fin_risk_config ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT ''enabled'' COMMENT ''状态: enabled=启用 disabled=停用'' AFTER risk_mode',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

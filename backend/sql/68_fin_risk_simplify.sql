-- ============================================================
-- 68_fin_risk_simplify.sql
-- 风控模型简化：与「新增风控」弹窗对齐，仅保留两种模式
--   release_mode = repay  还款释放
--   release_mode = monthly 每月比例释放
-- 废弃字段: risk_mode(池模式三选一) / fixed_limit_amount / monthly_release_amount
-- 幂等: 仅当列存在时 DROP
-- ============================================================

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config')
    AND EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config' AND COLUMN_NAME = 'risk_mode'),
    'ALTER TABLE biz_fin_risk_config DROP COLUMN risk_mode',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config')
    AND EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config' AND COLUMN_NAME = 'fixed_limit_amount'),
    'ALTER TABLE biz_fin_risk_config DROP COLUMN fixed_limit_amount',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config')
    AND EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config' AND COLUMN_NAME = 'monthly_release_amount'),
    'ALTER TABLE biz_fin_risk_config DROP COLUMN monthly_release_amount',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 67_fin_risk_release_mode.sql
-- 消费风控已付池模式增强: 分期批次未付部分的释放方式配置
--   release_mode = repay  : 仅还款释放（欠款对账还款后已还金额进入已付池）
--   release_mode = monthly: 每月按「各分期批次未付金额 × 释放比例」授予当月额度
-- 全额支付批次（对公转账）不限制；分期批次已付部分可直接消费。
-- 幂等: 仅当表存在且列缺失时执行 ALTER
-- ============================================================

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config')
    AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config' AND COLUMN_NAME = 'release_mode'),
    'ALTER TABLE biz_fin_risk_config ADD COLUMN release_mode VARCHAR(16) NOT NULL DEFAULT ''repay'' COMMENT ''未付部分释放方式: repay=还款释放 monthly=每月比例释放'' AFTER status',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config')
    AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config' AND COLUMN_NAME = 'monthly_release_ratio'),
    'ALTER TABLE biz_fin_risk_config ADD COLUMN monthly_release_ratio DECIMAL(6,4) NULL COMMENT ''每月释放比例(小数, 如0.1000=10%/月, monthly模式生效)'' AFTER release_mode',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

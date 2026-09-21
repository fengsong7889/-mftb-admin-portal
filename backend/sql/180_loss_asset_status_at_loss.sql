-- 180: 遗失单新增 asset_status_at_loss 字段（记录遗失时资产状态快照）
-- 用于前端判断是否需要展示「遗失时使用人」模块

-- 1. 加列（MySQL 8.x：先查 INFORMATION_SCHEMA 再 ADD）
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_loss' AND COLUMN_NAME = 'asset_status_at_loss'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE biz_eam_loss ADD COLUMN asset_status_at_loss VARCHAR(20) DEFAULT NULL COMMENT ''遗失时资产状态快照（idle/in_use）'' AFTER brand',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 回填已有记录：有原持有人 → in_use，无 → idle（按报失时业务逻辑推断，准确度高）
UPDATE biz_eam_loss l
SET l.asset_status_at_loss = CASE WHEN l.original_holder_id IS NOT NULL THEN 'in_use' ELSE 'idle' END
WHERE l.asset_status_at_loss IS NULL AND l.deleted = 0;

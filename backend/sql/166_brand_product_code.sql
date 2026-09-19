-- =====================================================================
-- 166: 资产品牌产品库编码列新增
--   1. biz_eam_model 新增 code 列（产品编码）
--   2. 存量产品编码回填：{品牌编码}-{3位品牌内序号}
--      示例：AB01-001, AB01-002
-- =====================================================================

-- ── 1. 产品型号表新增 code 列 ────────────────────────────────────────
-- 幂等：先检查列是否存在
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_model' AND COLUMN_NAME = 'code');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE biz_eam_model ADD COLUMN code VARCHAR(32) DEFAULT NULL COMMENT ''产品编码（品牌编码-3位序号）'' AFTER brand_logo',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. 添加索引 ─────────────────────────────────────────────────────
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_model' AND INDEX_NAME = 'idx_model_code');
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE biz_eam_model ADD INDEX idx_model_code (code)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 3. 存量产品编码回填 ─────────────────────────────────────────────
-- 按品牌分组，JOIN 品牌表取 code，生成 {brand_code}-{3位序号}
UPDATE biz_eam_model m
INNER JOIN biz_eam_brand b ON m.brand_id = b.id AND b.deleted = 0
SET m.code = CONCAT(b.code, '-', LPAD(
    ROW_NUMBER() OVER (PARTITION BY m.brand_id ORDER BY m.id),
    3, '0'
))
WHERE m.deleted = 0
  AND (m.code IS NULL OR m.code = '');

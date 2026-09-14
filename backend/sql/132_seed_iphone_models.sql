-- 批量写入 iPhone 型号数据到苹果品牌下
-- 前提：已通过前端创建 01-IT设备 → 01-01-手机 → 苹果品牌
-- 本脚本自动查找苹果品牌 ID，使用 INSERT IGNORE 避免重复

-- 先查看苹果品牌信息（执行后确认 brand_id 和 category_code）
-- SELECT id, category_code, brand_zh FROM biz_eam_brand WHERE brand_zh LIKE '%苹果%' OR brand_zh LIKE '%Apple%' AND deleted = 0;

INSERT IGNORE INTO biz_eam_model (category_code, brand_id, brand_zh, brand_en, model_no, name, unit, ref_price, updated_by)
SELECT
    b.category_code,
    b.id,
    b.brand_zh,
    b.brand_en,
    t.model_no,
    t.name,
    '台',
    0,
    '系統管理員'
FROM biz_eam_brand b
CROSS JOIN (
    SELECT 'A11'   AS model_no, 'iPhone (初代)'              AS name
    UNION ALL SELECT 'A12',   'iPhone 3G'
    UNION ALL SELECT 'A13',   'iPhone 3GS'
    UNION ALL SELECT 'A14',   'iPhone 4'
    UNION ALL SELECT 'A15',   'iPhone 4s'
    UNION ALL SELECT 'A16',   'iPhone 5'
    UNION ALL SELECT 'A17',   'iPhone 5c'
    UNION ALL SELECT 'A18',   'iPhone 5s'
    UNION ALL SELECT 'A19',   'iPhone 6'
    UNION ALL SELECT 'A20',   'iPhone 6 Plus'
    UNION ALL SELECT 'A21',   'iPhone 6s'
    UNION ALL SELECT 'A22',   'iPhone 6s Plus'
    UNION ALL SELECT 'A23',   'iPhone SE (第一代)'
    UNION ALL SELECT 'A24',   'iPhone 7'
    UNION ALL SELECT 'A25',   'iPhone 7 Plus'
    UNION ALL SELECT 'A26',   'iPhone 8'
    UNION ALL SELECT 'A27',   'iPhone 8 Plus'
    UNION ALL SELECT 'A28',   'iPhone X'
    UNION ALL SELECT 'A29',   'iPhone XS'
    UNION ALL SELECT 'A30',   'iPhone XS Max'
    UNION ALL SELECT 'A31',   'iPhone XR'
    UNION ALL SELECT 'A32',   'iPhone 11'
    UNION ALL SELECT 'A33',   'iPhone 11 Pro'
    UNION ALL SELECT 'A34',   'iPhone 11 Pro Max'
    UNION ALL SELECT 'A35',   'iPhone SE (第二代)'
    UNION ALL SELECT 'A36',   'iPhone 12 mini'
    UNION ALL SELECT 'A37',   'iPhone 12'
    UNION ALL SELECT 'A38',   'iPhone 12 Pro'
    UNION ALL SELECT 'A39',   'iPhone 12 Pro Max'
    UNION ALL SELECT 'A40',   'iPhone 13 mini'
    UNION ALL SELECT 'A41',   'iPhone 13'
    UNION ALL SELECT 'A42',   'iPhone 13 Pro'
    UNION ALL SELECT 'A43',   'iPhone 13 Pro Max'
    UNION ALL SELECT 'A44',   'iPhone SE (第三代)'
    UNION ALL SELECT 'A45',   'iPhone 14'
    UNION ALL SELECT 'A46',   'iPhone 14 Plus'
    UNION ALL SELECT 'A47',   'iPhone 14 Pro'
    UNION ALL SELECT 'A48',   'iPhone 14 Pro Max'
    UNION ALL SELECT 'A49',   'iPhone 15'
    UNION ALL SELECT 'A50',   'iPhone 15 Plus'
    UNION ALL SELECT 'A51',   'iPhone 15 Pro'
    UNION ALL SELECT 'A52',   'iPhone 15 Pro Max'
    UNION ALL SELECT 'A53',   'iPhone 16'
    UNION ALL SELECT 'A54',   'iPhone 16 Plus'
    UNION ALL SELECT 'A55',   'iPhone 16 Pro'
    UNION ALL SELECT 'A56',   'iPhone 16 Pro Max'
    UNION ALL SELECT 'A57',   'iPhone 16e'
    UNION ALL SELECT 'A58',   'iPhone 17'
    UNION ALL SELECT 'A59',   'iPhone Air'
    UNION ALL SELECT 'A60',   'iPhone 17 Pro'
    UNION ALL SELECT 'A61',   'iPhone 17 Pro Max'
    UNION ALL SELECT 'A62',   'iPhone 18 Pro'
    UNION ALL SELECT 'A63',   'iPhone 18 Pro Max'
    UNION ALL SELECT 'A64',   'iPhone Duo (折叠屏)'
) t
WHERE b.deleted = 0
  AND (b.brand_zh LIKE '%苹果%' OR b.brand_zh LIKE '%Apple%' OR b.brand_en LIKE '%Apple%')
LIMIT 1;

-- 删除「無敵星星-首頁黃金展位」算法记录
-- 背景：
--   该记录为 09_ad_promotion.sql 中预置的示例算法（algo_code=WD00001），
--   现需从算法库中移除。
-- 执行时间：2026-08-13

-- Step 1: 软删除关联的无敌星星计价配置（如有）
UPDATE biz_ad_pricing_star
SET deleted = 1, updated_at = NOW()
WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code = 'WD00001' AND deleted = 0)
  AND deleted = 0;

-- Step 2: 软删除关联的无敌星星商圈计价明细（如有，通过 pricing_id 关联）
UPDATE biz_ad_pricing_star_region
SET deleted = 1, updated_at = NOW()
WHERE pricing_id IN (
    SELECT id FROM biz_ad_pricing_star
    WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code = 'WD00001' AND deleted = 0)
      AND deleted = 0
)
AND deleted = 0;

-- Step 3: 软删除算法记录本身
UPDATE biz_ad_algorithm
SET deleted = 1, updated_at = NOW()
WHERE algo_code = 'WD00001' AND deleted = 0;

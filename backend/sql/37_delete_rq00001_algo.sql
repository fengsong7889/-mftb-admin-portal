-- 删除人气商家算法「澳門人氣-第一」(algo_code=RQ00001)
-- 背景：
--   用户要求从算法库中删除该条人气商家算法记录。
--   该记录原为「澳門人氣-第一」，由 27_fix_hot_algo_data.sql 将编码从 AM00001 修正为 RQ00001。
-- 执行时间：2026-08-13

-- Step 1: 软删除关联的人气商家定价配置（如有）
UPDATE biz_ad_pricing_hot
SET deleted = 1, updated_at = NOW()
WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code = 'RQ00001' AND deleted = 0)
  AND deleted = 0;

-- Step 2: 软删除算法记录本身
UPDATE biz_ad_algorithm
SET deleted = 1, updated_at = NOW()
WHERE algo_code = 'RQ00001' AND deleted = 0;

-- 软删除非法编码算法数据
-- 背景：
--   算法名称为「123」（纯数字）的人气商家算法，因 buildPrefix 未校验非字母前缀，
--   导致生成的 algo_code 为「1200001」（应为 RQ 前缀），不符合编码规则。
--   已修复 buildPrefix 增加字母校验 + algoType 兜底，此脚本清理历史脏数据。
-- 执行时间：2026-08-12

-- Step 1: 软删除关联的人气商家定价配置（如有）
UPDATE biz_ad_pricing_hot
SET deleted = 1, updated_at = NOW()
WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code = '1200001' AND deleted = 0)
  AND deleted = 0;

-- Step 2: 软删除编码为 1200001 的非法算法记录
UPDATE biz_ad_algorithm
SET algo_code = 'DEL_1200001', deleted = 1, updated_at = NOW()
WHERE algo_code = '1200001' AND deleted = 0;

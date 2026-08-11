-- 修复人气商家算法列表数据
-- 背景：
--   1. 「人氣商家-外賣版」(id=10) 是 SQL 种子脚本自动插入的测试数据，需删除
--   2. 「澳門人氣-第一」(id=12) 算法编码为 AM00001，应为 RQ 开头
-- 执行时间：2026-08-11

-- Step 1: 软删除测试数据「人氣商家-外賣版」(id=10)
-- 先改 algo_code 释放唯一键，再标记 deleted=1
UPDATE biz_ad_algorithm
SET algo_code = 'DEL_RQ00001', deleted = 1, updated_at = NOW()
WHERE id = 10 AND algo_code = 'RQ00001';

-- Step 2: 修正「澳門人氣-第一」(id=12) 算法编码 AM00001 → RQ00001
UPDATE biz_ad_algorithm
SET algo_code = 'RQ00001', updated_at = NOW()
WHERE id = 12 AND algo_code = 'AM00001';

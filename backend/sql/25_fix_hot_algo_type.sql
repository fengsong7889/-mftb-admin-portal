-- 修復人氣商家算法 algo_type 值
-- 背景：前端枚舉 POPULAR_MERCHANT_KA 從 10 改為 5（與後端 hasActivePricing 對齊）
-- 已有的算法記錄仍保存 algo_type=10，需遷移到 5
-- 執行時間：2026-08-11

UPDATE biz_ad_algorithm
SET algo_type = 5, updated_at = NOW()
WHERE algo_type = 10;

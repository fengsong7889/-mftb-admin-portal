-- 门店ID从5位升级到6位
-- 背景：
--   原门店编号格式为 MD + 5位序号（如 MD00001），随业务增长序号位不足，
--   统一升级为 MD + 6位序号（如 MD000001），与集团ID（JT+6位）保持一致。
-- 执行时间：2026-08-12

-- Step 1: 更新门店表中的 store_code（5位 → 6位，补零）
UPDATE biz_store
SET store_code = CONCAT('MD', LPAD(SUBSTRING(store_code, 3), 6, '0'))
WHERE store_code REGEXP '^MD[0-9]{5}$' AND deleted = 0;

-- Step 2: 更新 biz_seq 序列号表中门店的当前值（如有）
UPDATE biz_seq
SET current_value = current_value
WHERE prefix = 'MD' AND date_key = '00000000';
-- 注：biz_seq 只记录当前序号，格式由代码端控制，无需改数据

-- Step 3: 更新已删除的门店记录（保持数据一致性）
UPDATE biz_store
SET store_code = CONCAT('MD', LPAD(SUBSTRING(store_code, 3), 6, '0'))
WHERE store_code REGEXP '^MD[0-9]{5}$' AND deleted = 1;

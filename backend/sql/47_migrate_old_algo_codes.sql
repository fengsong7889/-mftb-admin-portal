-- =============================================================
-- 47. 舊算法編碼遷移為新規則格式（SQLPub 兼容版，無臨時表）
-- 格式: SFxx + YYYYMMDD + 3位自增序號
-- 逐條執行即可
-- =============================================================

-- 1. 更新算法表
UPDATE biz_ad_algorithm SET algo_code = 'SFWD20260818000' WHERE algo_code = 'WD00001' AND deleted = 0;
UPDATE biz_ad_algorithm SET algo_code = 'SFWD20260818001' WHERE algo_code = 'WD00002' AND deleted = 0;
UPDATE biz_ad_algorithm SET algo_code = 'SFPH20260818000' WHERE algo_code = 'PH00002' AND deleted = 0;
UPDATE biz_ad_algorithm SET algo_code = 'SFXD20260818000' WHERE algo_code = 'XD00003' AND deleted = 0;

-- 2. 快照同步: 訂單表算法編碼
UPDATE biz_ad_order SET algo_code = 'SFWD20260818000' WHERE algo_code = 'WD00001';
UPDATE biz_ad_order SET algo_code = 'SFWD20260818001' WHERE algo_code = 'WD00002';
UPDATE biz_ad_order SET algo_code = 'SFPH20260818000' WHERE algo_code = 'PH00002';
UPDATE biz_ad_order SET algo_code = 'SFXD20260818000' WHERE algo_code = 'XD00003';

-- 3. 快照同步: 贈送消耗表算法ID
UPDATE biz_gift_consume SET algorithm_id = 'SFWD20260818000' WHERE algorithm_id = 'WD00001';
UPDATE biz_gift_consume SET algorithm_id = 'SFWD20260818001' WHERE algorithm_id = 'WD00002';
UPDATE biz_gift_consume SET algorithm_id = 'SFPH20260818000' WHERE algorithm_id = 'PH00002';
UPDATE biz_gift_consume SET algorithm_id = 'SFXD20260818000' WHERE algorithm_id = 'XD00003';

-- 4. 快照同步: 瀑布流坑位表
UPDATE biz_ad_waterfall_slot SET algo_id = 'SFWD20260818000' WHERE algo_id = 'WD00001';
UPDATE biz_ad_waterfall_slot SET algo_id = 'SFWD20260818001' WHERE algo_id = 'WD00002';
UPDATE biz_ad_waterfall_slot SET algo_id = 'SFPH20260818000' WHERE algo_id = 'PH00002';
UPDATE biz_ad_waterfall_slot SET algo_id = 'SFXD20260818000' WHERE algo_id = 'XD00003';

-- 5. 更新 sys_biz_seq 確保後續生成不衝突
INSERT INTO sys_biz_seq (prefix, date_key, current_value) VALUES ('SFWD', '20260818', 2) ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, 2);
INSERT INTO sys_biz_seq (prefix, date_key, current_value) VALUES ('SFPH', '20260818', 1) ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, 1);
INSERT INTO sys_biz_seq (prefix, date_key, current_value) VALUES ('SFXD', '20260818', 1) ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, 1);

-- 6. 驗證
SELECT id, algo_code, algo_name, algo_type FROM biz_ad_algorithm WHERE deleted = 0 ORDER BY id;

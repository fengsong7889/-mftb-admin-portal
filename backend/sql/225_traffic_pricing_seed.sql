-- =============================================================
-- 225_traffic_pricing_seed.sql
-- 投流廣告銷售定價種子（一次性參考文檔）
--   實際執行由後端 AdPromotionDataInitializer.seedTrafficPricingIfAbsent() 負責：
--   「表內無任何行（含軟刪）且存在 algo_type=15 算法」時補 3 個業務頻道，
--   每次啟動判條件、天然冪等，因此沒有對應的 sys_schema_version 版本鍵。
--
-- 背景：投流定價此前只存在瀏覽器 localStorage，後端 biz_ad_pricing_traffic 從未寫入。
--       銷售定價列表改走後端後若不補種，列表會直接空掉。
-- 說明：pricing_no 必須由後端 BizSeqService（規則 config_pricing_traffic）生成，
--       本腳本用佔位號僅供離線環境手工執行參考；正式環境請走應用啟動。
-- =============================================================

-- 0) 前置檢查：僅當主表為空時才執行下面的插入
SELECT COUNT(*) AS existing_rows FROM `biz_ad_pricing_traffic`;
SELECT id, algo_code, algo_name, brand FROM `biz_ad_algorithm`
WHERE algo_type = 15 AND deleted = 0 ORDER BY id LIMIT 1;

-- 1) 主表：三個業務頻道（algo_id 按上面查出的投流算法 ID 替換）
INSERT INTO `biz_ad_pricing_traffic`
    (`pricing_no`, `algo_id`, `algo_name`, `brand`, `biz_channel`, `custom_min_qty`, `custom_step`,
     `refund_enabled`, `refund_fee_percent`, `status`, `remark`, `updated_by`, `deleted`)
SELECT 'DJTL-SEED-1', a.id, a.algo_name, a.brand, 1, 100, 100, 1, 0, 1, '系統預置流量包定價', '系統', 0
FROM `biz_ad_algorithm` a WHERE a.algo_type = 15 AND a.deleted = 0 ORDER BY a.id LIMIT 1;

INSERT INTO `biz_ad_pricing_traffic`
    (`pricing_no`, `algo_id`, `algo_name`, `brand`, `biz_channel`, `custom_min_qty`, `custom_step`,
     `refund_enabled`, `refund_fee_percent`, `status`, `remark`, `updated_by`, `deleted`)
SELECT 'DJTL-SEED-2', a.id, a.algo_name, a.brand, 2, 100, 100, 1, 0, 1, '系統預置流量包定價', '系統', 0
FROM `biz_ad_algorithm` a WHERE a.algo_type = 15 AND a.deleted = 0 ORDER BY a.id LIMIT 1;

INSERT INTO `biz_ad_pricing_traffic`
    (`pricing_no`, `algo_id`, `algo_name`, `brand`, `biz_channel`, `custom_min_qty`, `custom_step`,
     `refund_enabled`, `refund_fee_percent`, `status`, `remark`, `updated_by`, `deleted`)
SELECT 'DJTL-SEED-3', a.id, a.algo_name, a.brand, 3, 100, 100, 1, 0, 1, '系統預置流量包定價', '系統', 0
FROM `biz_ad_algorithm` a WHERE a.algo_type = 15 AND a.deleted = 0 ORDER BY a.id LIMIT 1;

-- 2) 檔位子表（流量包套餐）：美食外賣 200/900/1600，超市百貨 180/800/1450，團購到店 220/990/1760
INSERT INTO `biz_ad_pricing_traffic_tier`
    (`pricing_id`, `tier_name`, `impressions`, `price`, `on_sale`, `sort`, `discount_enabled`, `discount_time_mode`, `deleted`)
SELECT p.id, t.tier_name, t.impressions, t.price, 1, t.sort, 0, 'unlimited', 0
FROM `biz_ad_pricing_traffic` p
JOIN (SELECT 1 AS biz_channel, '體驗包' AS tier_name, 1000 AS impressions, 200 AS price, 1 AS sort
      UNION ALL SELECT 1, '成長包', 5000, 900, 2
      UNION ALL SELECT 1, '爆款包', 10000, 1600, 3
      UNION ALL SELECT 2, '體驗包', 1000, 180, 1
      UNION ALL SELECT 2, '成長包', 5000, 800, 2
      UNION ALL SELECT 2, '爆款包', 10000, 1450, 3
      UNION ALL SELECT 3, '體驗包', 1000, 220, 1
      UNION ALL SELECT 3, '成長包', 5000, 990, 2
      UNION ALL SELECT 3, '爆款包', 10000, 1760, 3) t ON t.biz_channel = p.biz_channel
WHERE p.pricing_no LIKE 'DJTL-SEED-%';

-- 3) 階梯單價子表（僅下限，上限由下一梯度下限推導，末檔 max_qty=0 表示無上限）
INSERT INTO `biz_ad_pricing_traffic_ladder`
    (`pricing_id`, `min_qty`, `max_qty`, `unit_price`, `sort`, `deleted`)
SELECT p.id, l.min_qty, l.max_qty, l.unit_price, l.sort, 0
FROM `biz_ad_pricing_traffic` p
JOIN (SELECT 1 AS biz_channel, 1 AS min_qty, 999 AS max_qty, 0.25 AS unit_price, 1 AS sort
      UNION ALL SELECT 1, 1000, 4999, 0.20, 2
      UNION ALL SELECT 1, 5000, 0, 0.16, 3
      UNION ALL SELECT 2, 1, 999, 0.22, 1
      UNION ALL SELECT 2, 1000, 4999, 0.18, 2
      UNION ALL SELECT 2, 5000, 0, 0.15, 3
      UNION ALL SELECT 3, 1, 999, 0.28, 1
      UNION ALL SELECT 3, 1000, 4999, 0.22, 2
      UNION ALL SELECT 3, 5000, 0, 0.18, 3) l ON l.biz_channel = p.biz_channel
WHERE p.pricing_no LIKE 'DJTL-SEED-%';

-- 4) 校驗：應為 3 條主表 / 9 條檔位 / 9 條階梯
SELECT p.biz_channel, p.pricing_no, p.algo_id,
       (SELECT COUNT(*) FROM `biz_ad_pricing_traffic_tier` t WHERE t.pricing_id = p.id) AS tiers,
       (SELECT COUNT(*) FROM `biz_ad_pricing_traffic_ladder` l WHERE l.pricing_id = p.id) AS ladder_rows
FROM `biz_ad_pricing_traffic` p ORDER BY p.biz_channel;

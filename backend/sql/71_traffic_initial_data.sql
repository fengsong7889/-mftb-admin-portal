-- ============================================================
-- MFTB 投流广告模块 - 初始数据
-- 数据库：MySQL 8.0+
-- 用途：初始化投流广告算法及示例定价配置
-- ============================================================

-- ============================================================
-- 一、初始化投流广告算法（algo_type = 15）
-- ============================================================

-- 1.1 投流广告算法 - 美食外卖版
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
SELECT 'TL00001', '投流廣告 - 美食外賣版', 15, 'flashBee', 1, 2, 1,
       JSON_OBJECT(
           'targetingMode', 'impressions',
           'deliverySlot', 'business',
           'minBudget', 100,
           'maxBudget', 50000
       ),
       1, '系統預置投流算法（美食外賣）', '系統')
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT 1) t 
    WHERE NOT EXISTS (
        SELECT 1 FROM biz_ad_algorithm 
        WHERE algo_code = 'TL00001' AND deleted = 0
    )
);

-- 1.2 投流广告算法 - 超市百货版
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
SELECT 'TL00002', '投流廣告 - 超市百貨版', 15, 'flashBee', 2, 3, 1,
       JSON_OBJECT(
           'targetingMode', 'impressions',
           'deliverySlot', 'business',
           'minBudget', 100,
           'maxBudget', 50000
       ),
       1, '系統預置投流算法（超市百貨）', '系統')
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT 1) t 
    WHERE NOT EXISTS (
        SELECT 1 FROM biz_ad_algorithm 
        WHERE algo_code = 'TL00002' AND deleted = 0
    )
);

-- 1.3 投流广告算法 - 团购到店版
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
SELECT 'TL00003', '投流廣告 - 團購到店版', 15, 'flashBee', 3, 4, 1,
       JSON_OBJECT(
           'targetingMode', 'impressions',
           'deliverySlot', 'allDay',
           'minBudget', 100,
           'maxBudget', 50000
       ),
       1, '系統預置投流算法（團購到店）', '系統')
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT 1) t 
    WHERE NOT EXISTS (
        SELECT 1 FROM biz_ad_algorithm 
        WHERE algo_code = 'TL00003' AND deleted = 0
    )
);

-- 1.4 投流广告算法 - mFood 美食版
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
SELECT 'TL00004', '投流廣告 - mFood 美食版', 15, 'mFood', 1, 2, 1,
       JSON_OBJECT(
           'targetingMode', 'impressions',
           'deliverySlot', 'business',
           'minBudget', 100,
           'maxBudget', 50000
       ),
       1, '系統預置投流算法（mFood 美食）', '系統')
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT 1) t 
    WHERE NOT EXISTS (
        SELECT 1 FROM biz_ad_algorithm 
        WHERE algo_code = 'TL00004' AND deleted = 0
    )
);

-- ============================================================
-- 二、初始化示例定价配置（每个算法的 3 个业务频道）
-- ============================================================

-- 2.1 美食外卖版定价配置（bizChannel=1）
INSERT INTO biz_ad_pricing_traffic (pricing_no, algo_id, algo_name, brand, biz_channel, custom_min_qty, custom_step, refund_enabled, refund_fee_percent, status, remark, updated_by, deleted)
SELECT 'DJTL20260903001', a.id, a.algo_name, 'flashBee', 1, 100, 100, 1, 0, 1, '系統預置定價配置', '系統', 0
FROM biz_ad_algorithm a
WHERE a.algo_code = 'TL00001' 
  AND a.deleted = 0
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic p 
      WHERE p.algo_id = a.id 
      AND p.biz_channel = 1 
      AND p.deleted = 0
  );

-- 2.2 超市百货版定价配置（bizChannel=2）
INSERT INTO biz_ad_pricing_traffic (pricing_no, algo_id, algo_name, brand, biz_channel, custom_min_qty, custom_step, refund_enabled, refund_fee_percent, status, remark, updated_by, deleted)
SELECT 'DJTL20260903002', a.id, a.algo_name, 'flashBee', 2, 100, 100, 1, 0, 1, '系統預置定價配置', '系統', 0
FROM biz_ad_algorithm a
WHERE a.algo_code = 'TL00002' 
  AND a.deleted = 0
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic p 
      WHERE p.algo_id = a.id 
      AND p.biz_channel = 2 
      AND p.deleted = 0
  );

-- 2.3 团购到店版定价配置（bizChannel=3）
INSERT INTO biz_ad_pricing_traffic (pricing_no, algo_id, algo_name, brand, biz_channel, custom_min_qty, custom_step, refund_enabled, refund_fee_percent, status, remark, updated_by, deleted)
SELECT 'DJTL20260903003', a.id, a.algo_name, 'flashBee', 3, 100, 100, 1, 0, 1, '系統預置定價配置', '系統', 0
FROM biz_ad_algorithm a
WHERE a.algo_code = 'TL00003' 
  AND a.deleted = 0
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic p 
      WHERE p.algo_id = a.id 
      AND p.biz_channel = 3 
      AND p.deleted = 0
  );

-- ============================================================
-- 三、初始化预设档位（每个定价配置的流量包套餐）
-- ============================================================

-- 3.1 美食外卖版 - 基础版流量包
INSERT INTO biz_ad_pricing_traffic_tier (pricing_id, tier_name, tier_code, impressions, price, sell_days, on_sale, sort, remark)
SELECT p.id, '基礎版', 'TRAFFIC_TIER_BASIC_001', 10000, 150.00, 30, 1, 1, '適合新店測試'
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_tier t 
      WHERE t.pricing_id = p.id 
      AND t.tier_code = 'TRAFFIC_TIER_BASIC_001'
  );

-- 3.2 美食外卖版 - 标准版流量包
INSERT INTO biz_ad_pricing_traffic_tier (pricing_id, tier_name, tier_code, impressions, price, sell_days, on_sale, sort, remark)
SELECT p.id, '標準版', 'TRAFFIC_TIER_STANDARD_001', 50000, 600.00, 30, 1, 2, '適合日常推廣'
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_tier t 
      WHERE t.pricing_id = p.id 
      AND t.tier_code = 'TRAFFIC_TIER_STANDARD_001'
  );

-- 3.3 美食外卖版 - 进阶版流量包
INSERT INTO biz_ad_pricing_traffic_tier (pricing_id, tier_name, tier_code, impressions, price, sell_days, on_sale, sort, remark)
SELECT p.id, '進階版', 'TRAFFIC_TIER_ADVANCED_001', 100000, 1100.00, 30, 1, 3, '適合大型活動'
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_tier t 
      WHERE t.pricing_id = p.id 
      AND t.tier_code = 'TRAFFIC_TIER_ADVANCED_001'
  );

-- ============================================================
-- 四、初始化阶梯单价（自定义购买按曝光量计价）
-- ============================================================

-- 4.1 美食外卖版 - 阶梯单价（1-9999 次曝光）
INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT p.id, 1000, 9999, 0.15, 1
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_ladder l 
      WHERE l.pricing_id = p.id 
      AND l.min_qty = 1000 
      AND l.max_qty = 9999
  );

-- 4.2 美食外卖版 - 阶梯单价（1-9999 次曝光）
INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT p.id, 10000, 49999, 0.12, 2
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_ladder l 
      WHERE l.pricing_id = p.id 
      AND l.min_qty = 10000 
      AND l.max_qty = 49999
  );

-- 4.3 美食外卖版 - 阶梯单价（5-999 次曝光）
INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT p.id, 50000, 99999, 0.10, 3
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_ladder l 
      WHERE l.pricing_id = p.id 
      AND l.min_qty = 50000 
      AND l.max_qty = 99999
  );

-- 4.4 美食外卖版 - 阶梯单价（无上限）
INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT p.id, 100000, NULL, 0.08, 4
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_code = 'TL00001' 
  AND p.biz_channel = 1
  AND NOT EXISTS (
      SELECT 1 FROM biz_ad_pricing_traffic_ladder l 
      WHERE l.pricing_id = p.id 
      AND l.min_qty = 100000 
      AND l.max_qty IS NULL
  );

-- ============================================================
-- 五、补充说明
-- ============================================================
-- 注意：以上 SQL 仅初始化了 TL00001 算法的数据作为示例
-- 其余算法（TL00002/TL00003/TL00004）的定价配置和档位可参考上述模式继续添加
-- 
-- 前端菜单对应关系：
-- 1. 算法库菜单：GET /api/ad/algorithm - 查询 algo_type=15 的算法列表
-- 2. 销售定价菜单：GET/POST /api/ad/pricing/traffic - 管理定价配置 + 档位 + 阶梯单价
-- 3. 广告销售菜单：POST /api/ad/sales/traffic/order - 下单购买投流广告
-- 4. 店铺推广界面：复用订单查询接口，过滤该门店可见的投流算法


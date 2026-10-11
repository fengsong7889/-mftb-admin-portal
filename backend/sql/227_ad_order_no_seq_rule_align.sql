-- =============================================================
-- 227_ad_order_no_seq_rule_align.sql
-- 廣告訂單編號口径收口（一次性參考文檔）
--   實際執行與冪等保證由後端 BizSeqRuleInitializer 的 seq:init-v20 遷移負責，
--   本腳本僅供 DBA 人工核對與離線環境手動執行使用。
--
-- 背景:
--   編號規則化改造（commit 0c9c061）之前，所有廣告訂單共用硬編碼的 GD 前綴下單；
--   規則化後下單已改走 sys_biz_seq_rule 的 ad_order_* 規則（新店 DDXD/無敵星星 DDWD/...），
--   但存量庫裡的舊 GD 訂單號從未改寫——歷史腳本 34_migrate_history_codes.sql 未在任何環境
--   執行過，且它也不同步 biz_ad_order_item_* 明細表快照。結果「訂單列表」裡新店廣告等訂單
--   仍顯示 GD 前綴，與「規則中心 → 編號生成規則」記錄（DDXD + 年月日 + 4位自增）對不上。
--   另外金字招牌訂單（algo_type=13）至今沒有對應規則行，下單會直接報「編號生成規則未配置」。
--
-- 1. 登記 6 條廣告訂單編號規則到「廣告銷售」菜單（DDWD/DDXD/DDPH/DDLL/DDRQ/DDZP）
-- 2. sys_biz_seq 計數對齊到存量最大號，避免重新取號撞 biz_ad_order.order_no 唯一鍵
-- 3. 存量訂單號按創建日期重新取號，同步各明細表與贈送流水快照
-- 4. 清理舊生成器殘留的 GD 孤兒計數行（僅當已無任何規則使用該前綴）
-- 5. 修正 order_no 列註釋（舊註釋仍寫著「GD + 年月日 + 4位自增」）
--
-- 執行須知:
--   1. MySQL 8.0+（使用窗口函數），執行前請先備份 biz_ad_order 及各明細表、biz_gift_consume
--   2. 冪等: 已符合現行格式 ^(DD[A-Z]{2}[0-9]{12})$ 的編號不會被重復改寫
--   3. 算法類型無法映射到規則的訂單一律跳過並需人工核對，不猜測前綴
-- =============================================================

-- 1) 登記 6 條廣告訂單編號規則（rule_key 唯一鍵冪等覆蓋；前綴唯一鍵要求 DDZP 未被佔用）
INSERT INTO `sys_biz_seq_rule`
    (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `status`, `remark`)
VALUES
    ('ad_order_star',      '無敵星星訂單', '廣告銷售', 'DDWD', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_new_store', '新店廣告訂單', '廣告銷售', 'DDXD', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_revive',    '盤活復蘇訂單', '廣告銷售', 'DDPH', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_traffic',   '投流廣告訂單', '廣告銷售', 'DDLL', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_popular',   '人氣商家訂單', '廣告銷售', 'DDRQ', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_signboard', '金字招牌訂單', '廣告銷售', 'DDZP', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE
    `rule_name`   = VALUES(`rule_name`),
    `biz_menu`    = VALUES(`biz_menu`),
    `prefix`      = VALUES(`prefix`),
    `date_format` = VALUES(`date_format`),
    `seq_length`  = VALUES(`seq_length`),
    `seq_start`   = VALUES(`seq_start`),
    `status`      = VALUES(`status`),
    `remark`      = VALUES(`remark`);

-- 2) sys_biz_seq 計數對齊（seq_start=0 規則下 current_value = 最大序號 + 1，與運行期生成器同口徑）
INSERT INTO `sys_biz_seq` (`prefix`, `date_key`, `current_value`)
SELECT LEFT(order_no, 4), MID(order_no, 5, 8), MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) + 1
FROM `biz_ad_order`
WHERE order_no REGEXP '^DD[A-Z]{2}[0-9]{12}$'
GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
ON DUPLICATE KEY UPDATE `current_value` = GREATEST(`current_value`, VALUES(`current_value`));

-- 3) 存量訂單號重新取號：日期段取 created_at，同日按 id 升序，並接在該日已用最大序號之後
DROP TEMPORARY TABLE IF EXISTS tmp_ad_order_map;
CREATE TEMPORARY TABLE tmp_ad_order_map AS
SELECT t.id, t.order_no AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, order_no, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT id, order_no, created_at,
               CASE algo_type WHEN 1 THEN 'DDWD' WHEN 2 THEN 'DDXD' WHEN 3 THEN 'DDPH'
                              WHEN 5 THEN 'DDRQ' WHEN 13 THEN 'DDZP' WHEN 15 THEN 'DDLL' END AS prefix
        FROM `biz_ad_order`
        WHERE algo_type IN (1, 2, 3, 5, 13, 15)
          AND (order_no IS NULL OR order_no NOT REGEXP '^DD[A-Z]{2}[0-9]{12}$')
    ) x
) t
LEFT JOIN (
    SELECT LEFT(order_no, 4) AS prefix, MID(order_no, 5, 8) AS dkey,
           MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) AS maxseq
    FROM `biz_ad_order`
    WHERE order_no REGEXP '^DD[A-Z]{2}[0-9]{12}$'
    GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

UPDATE `biz_ad_order` o JOIN tmp_ad_order_map m ON o.id = m.id
SET o.order_no = m.new_code;

-- 3.1) 明細表快照按外鍵同步（訂單號可能已被人工改過，按舊值匹配會漏行）
UPDATE `biz_ad_order_item_star` i      JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_new_store` i JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_revive` i    JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_traffic` i   JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_hot` i       JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
-- 金字招牌明細表由 sql/55_golden_signboard_order.sql 建表，存量庫可能尚未建，缺失時手工註釋本行
-- UPDATE `biz_ad_order_item_signboard` i JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;

-- 3.2) 贈送流水快照（只存訂單號、無外鍵，按舊號同步）
UPDATE `biz_gift_consume` c JOIN tmp_ad_order_map m ON c.order_no = m.old_code
SET c.order_no = m.new_code;

-- 4) 取號後再對齊一次計數，確保後續下單不重號
INSERT INTO `sys_biz_seq` (`prefix`, `date_key`, `current_value`)
SELECT LEFT(order_no, 4), MID(order_no, 5, 8), MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) + 1
FROM `biz_ad_order`
WHERE order_no REGEXP '^DD[A-Z]{2}[0-9]{12}$'
GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
ON DUPLICATE KEY UPDATE `current_value` = GREATEST(`current_value`, VALUES(`current_value`));

-- 5) 清理舊生成器殘留的 GD 孤兒計數行（僅當已無任何規則使用該前綴）
DELETE s FROM `sys_biz_seq` s
WHERE s.`prefix` = 'GD'
  AND NOT EXISTS (SELECT 1 FROM `sys_biz_seq_rule` r WHERE r.`prefix` = 'GD');

-- 6) 修正列註釋（舊註釋寫的是規則化之前的 GD 口徑）
ALTER TABLE `biz_ad_order`
    MODIFY COLUMN `order_no` VARCHAR(64) NOT NULL
    COMMENT '订单编号: 按编号生成规则 ad_order_* 生成（DDxx + 年月日 + 4位自增序号，如 DDXD202608120000）';

-- =============================================================
-- 驗數（執行後應全部為 0）
-- =============================================================
SELECT '殘留舊格式訂單號' AS check_name, COUNT(*) AS bad_rows
FROM `biz_ad_order`
WHERE algo_type IN (1, 2, 3, 5, 13, 15)
  AND (order_no IS NULL OR order_no NOT REGEXP '^DD[A-Z]{2}[0-9]{12}$')
UNION ALL
SELECT '明細快照與主表不一致', COUNT(*)
FROM `biz_ad_order_item_new_store` i JOIN `biz_ad_order` o ON o.id = i.order_id
WHERE i.order_no <> o.order_no
UNION ALL
SELECT '贈送流水快照與主表不一致', COUNT(*)
FROM `biz_gift_consume` c JOIN `biz_ad_order` o ON o.order_no = c.order_no
WHERE c.order_no NOT REGEXP '^DD[A-Z]{2}[0-9]{12}$'
UNION ALL
SELECT '廣告訂單規則缺行', 6 - COUNT(*)
FROM `sys_biz_seq_rule`
WHERE rule_key IN ('ad_order_star','ad_order_new_store','ad_order_revive',
                   'ad_order_traffic','ad_order_popular','ad_order_signboard')
  AND biz_menu = '廣告銷售' AND status = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_ad_order_map;
-- =============================================================
-- 227_ad_order_no_seq_rule_align.sql
-- 廣告訂單編號口径收口（一次性參考文檔）
--   實際執行與冪等保證由後端 BizSeqRuleInitializer 的 seq:init-v20 遷移負責，
--   本腳本僅供 DBA 人工核對與離線環境手動執行使用。
--
-- 背景:
--   編號規則化改造（commit 0c9c061）之前，所有廣告訂單共用硬編碼的 GD 前綴下單；
--   規則化後下單已改走 sys_biz_seq_rule 的 ad_order_* 規則（新店 DDXD/無敵星星 DDWD/...），
--   但存量庫裡的舊 GD 訂單號從未改寫——歷史腳本 34_migrate_history_codes.sql 未在任何環境
--   執行過，且它也不同步 biz_ad_order_item_* 明細表快照。結果「訂單列表」裡新店廣告等訂單
--   仍顯示 GD 前綴，與「規則中心 → 編號生成規則」記錄（DDXD + 年月日 + 4位自增）對不上。
--   另外金字招牌訂單（algo_type=13）至今沒有對應規則行，下單會直接報「編號生成規則未配置」。
--
-- 1. 登記 6 條廣告訂單編號規則到「廣告銷售」菜單（DDWD/DDXD/DDPH/DDLL/DDRQ/DDZP）
-- 2. sys_biz_seq 計數對齊到存量最大號，避免重新取號撞 biz_ad_order.order_no 唯一鍵
-- 3. 存量訂單號按創建日期重新取號，同步各明細表與贈送流水快照
-- 4. 清理舊生成器殘留的 GD 孤兒計數行（僅當已無任何規則使用該前綴）
-- 5. 修正 order_no 列註釋（舊註釋仍寫著「GD + 年月日 + 4位自增」）
--
-- 執行須知:
--   1. MySQL 8.0+（使用窗口函數），執行前請先備份 biz_ad_order 及各明細表、biz_gift_consume
--   2. 冪等: 已符合現行格式 ^(DD[A-Z]{2}[0-9]{12})$ 的編號不會被重復改寫
--   3. 算法類型無法映射到規則的訂單一律跳過並需人工核對，不猜測前綴
-- =============================================================

-- 1) 登記 6 條廣告訂單編號規則（rule_key 唯一鍵冪等覆蓋；前綴唯一鍵要求 DDZP 未被佔用）
INSERT INTO `sys_biz_seq_rule`
    (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `status`, `remark`)
VALUES
    ('ad_order_star',      '無敵星星訂單', '廣告銷售', 'DDWD', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_new_store', '新店廣告訂單', '廣告銷售', 'DDXD', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_revive',    '盤活復蘇訂單', '廣告銷售', 'DDPH', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_traffic',   '投流廣告訂單', '廣告銷售', 'DDLL', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_popular',   '人氣商家訂單', '廣告銷售', 'DDRQ', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('ad_order_signboard', '金字招牌訂單', '廣告銷售', 'DDZP', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE
    `rule_name`   = VALUES(`rule_name`),
    `biz_menu`    = VALUES(`biz_menu`),
    `prefix`      = VALUES(`prefix`),
    `date_format` = VALUES(`date_format`),
    `seq_length`  = VALUES(`seq_length`),
    `seq_start`   = VALUES(`seq_start`),
    `status`      = VALUES(`status`),
    `remark`      = VALUES(`remark`);

-- 2) sys_biz_seq 計數對齊（seq_start=0 規則下 current_value = 最大序號 + 1，與運行期生成器同口徑）
INSERT INTO `sys_biz_seq` (`prefix`, `date_key`, `current_value`)
SELECT LEFT(order_no, 4), MID(order_no, 5, 8), MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) + 1
FROM `biz_ad_order`
WHERE order_no REGEXP '^DD[A-Z]{2}[0-9]{12}$'
GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
ON DUPLICATE KEY UPDATE `current_value` = GREATEST(`current_value`, VALUES(`current_value`));

-- 3) 存量訂單號重新取號：日期段取 created_at，同日按 id 升序，並接在該日已用最大序號之後
DROP TEMPORARY TABLE IF EXISTS tmp_ad_order_map;
CREATE TEMPORARY TABLE tmp_ad_order_map AS
SELECT t.id, t.order_no AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, order_no, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT id, order_no, created_at,
               CASE algo_type WHEN 1 THEN 'DDWD' WHEN 2 THEN 'DDXD' WHEN 3 THEN 'DDPH'
                              WHEN 5 THEN 'DDRQ' WHEN 13 THEN 'DDZP' WHEN 15 THEN 'DDLL' END AS prefix
        FROM `biz_ad_order`
        WHERE algo_type IN (1, 2, 3, 5, 13, 15)
          AND (order_no IS NULL OR order_no NOT REGEXP '^DD[A-Z]{2}[0-9]{12}$')
    ) x
) t
LEFT JOIN (
    SELECT LEFT(order_no, 4) AS prefix, MID(order_no, 5, 8) AS dkey,
           MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) AS maxseq
    FROM `biz_ad_order`
    WHERE order_no REGEXP '^DD[A-Z]{2}[0-9]{12}$'
    GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

UPDATE `biz_ad_order` o JOIN tmp_ad_order_map m ON o.id = m.id
SET o.order_no = m.new_code;

-- 3.1) 明細表快照按外鍵同步（訂單號本身可能已被人工改過，按舊值匹配會漏行）
UPDATE `biz_ad_order_item_star` i      JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_new_store` i JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_revive` i    JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_traffic` i   JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
UPDATE `biz_ad_order_item_hot` i       JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;
-- 金字招牌明細表由 sql/55_golden_signboard_order.sql 建表，存量庫可能尚未建，缺失時手工執行本行
-- UPDATE `biz_ad_order_item_signboard` i JOIN tmp_ad_order_map m ON i.order_id = m.id SET i.order_no = m.new_code;

-- 3.2) 贈送流水快照（只存訂單號、無外鍵，按舊號同步）
UPDATE `biz_gift_consume` c JOIN tmp_ad_order_map m ON c.order_no = m.old_code
SET c.order_no = m.new_code;

-- 4) 取號後再對齊一次計數，確保後續下單不重號
INSERT INTO `sys_biz_seq` (`prefix`, `date_key`, `current_value`)
SELECT LEFT(order_no, 4), MID(order_no, 5, 8), MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) + 1
FROM `biz_ad_order`
WHERE order_no REGEXP '^DD[A-Z]{2}[0-9]{12}$'
GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
ON DUPLICATE KEY UPDATE `current_value` = GREATEST(`current_value`, VALUES(`current_value`));

-- 5) 清理舊生成器殘留的 GD 孤兒計數行（僅當已無任何規則使用該前綴）
DELETE s FROM `sys_biz_seq` s
WHERE s.`prefix` = 'GD'
  AND NOT EXISTS (SELECT 1 FROM `sys_biz_seq_rule` r WHERE r.`prefix` = 'GD');

-- 6) 修正列註釋（舊註釋寫的是規則化之前的 GD 口徑）
ALTER TABLE `biz_ad_order`
    MODIFY COLUMN `order_no` VARCHAR(64) NOT NULL
    COMMENT '订单编号: 按编号生成规则 ad_order_* 生成（DDxx + 年月日 + 4位自增序号，如 DDXD202608120000）';

-- =============================================================
-- 驗數（執行後應全部為 0）
-- =============================================================
SELECT '殘留舊格式訂單號' AS check_name, COUNT(*) AS bad_rows
FROM `biz_ad_order`
WHERE algo_type IN (1, 2, 3, 5, 13, 15)
  AND (order_no IS NULL OR order_no NOT REGEXP '^DD[A-Z]{2}[0-9]{12}$')
UNION ALL
SELECT '明細快照與主表不一致', COUNT(*)
FROM `biz_ad_order_item_new_store` i JOIN `biz_ad_order` o ON o.id = i.order_id
WHERE i.order_no <> o.order_no
UNION ALL
SELECT '贈送流水快照與主表不一致', COUNT(*)
FROM `biz_gift_consume` c JOIN `biz_ad_order` o ON o.order_no = c.order_no
WHERE c.order_no NOT REGEXP '^DD[A-Z]{2}[0-9]{12}$'
UNION ALL
SELECT '廣告訂單規則缺行', 6 - COUNT(*)
FROM `sys_biz_seq_rule`
WHERE rule_key IN ('ad_order_star','ad_order_new_store','ad_order_revive',
                   'ad_order_traffic','ad_order_popular','ad_order_signboard')
  AND biz_menu = '廣告銷售' AND status = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_ad_order_map;

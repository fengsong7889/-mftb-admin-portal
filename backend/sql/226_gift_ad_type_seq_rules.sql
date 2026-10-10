-- =============================================================
-- 226_gift_ad_type_seq_rules.sql
-- 贈送ID口徑收口（一次性參考文檔）
--   實際執行與冪等保證由後端 BizSeqRuleInitializer 的 seq:init-v19 遷移負責，
--   本腳本僅供 DBA 人工核對與離線環境手動執行使用。
--
-- 背景:
--   「新增贈送」可選的廣告類型與後端 BizSeqService.giftRuleKey 支持的類型不一致——
--   金字招牌(golden_signboard)/投流廣告(traffic_ad) 在廣告銷售下單時會按 adType 查贈送天數抵扣，
--   但既沒有贈送ID編號規則、也無法生成贈送ID，導致這兩個模組的贈送能力斷鏈（抵扣恆為 0）。
--
-- 1. 登記 5 條贈送ID編號規則到「推廣贈送」菜單（XDZS/RQZS/PHZS/JZZS/TLZS）
--    取代 33_biz_seq_rule.sql 中只有 3 條的舊寫法
-- 2. 存量贈送ID回填：不符合現行格式 (前綴 + YYYYMMDD + 4位序號) 的 gift_id 按創建日期重新取號
-- 3. biz_gift_consume 的贈送ID快照按外鍵同步（舊數據 gift_id 可能為 NULL，按快照值匹配會漏行）
-- 4. sys_biz_seq 計數對齊，避免運行期生成器重號
-- 5. 清理舊贈送ID生成器殘留的 GZ 孤兒計數行（僅當已無任何規則使用該前綴）
--
-- 執行須知:
--   1. MySQL 8.0+（使用窗口函數），執行前請先備份 biz_gift_record / biz_gift_consume
--   2. 冪等: 已符合現行格式的編號不會被重復改寫；規則行按 rule_key 覆蓋更新
--   3. 廣告類型無法映射到規則的記錄一律跳過並需人工核對，不猜測前綴
-- =============================================================

-- 1) 登記 5 條贈送ID編號規則（rule_key 唯一鍵冪等覆蓋；前綴唯一鍵要求 JZZS/TLZS 未被佔用）
INSERT INTO `sys_biz_seq_rule`
    (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `status`, `remark`)
VALUES
    ('gift_new_store', '新店廣告贈送ID',  '推廣贈送', 'XDZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_popular',   '人氣商家贈送ID',  '推廣贈送', 'RQZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_revive',    '盤活復蘇贈送ID',  '推廣贈送', 'PHZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_signboard', '金字招牌贈送ID',  '推廣贈送', 'JZZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_traffic',   '投流廣告贈送ID',  '推廣贈送', 'TLZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE
    `rule_name`   = VALUES(`rule_name`),
    `biz_menu`    = VALUES(`biz_menu`),
    `prefix`      = VALUES(`prefix`),
    `date_format` = VALUES(`date_format`),
    `seq_length`  = VALUES(`seq_length`),
    `seq_start`   = VALUES(`seq_start`),
    `status`      = VALUES(`status`),
    `remark`      = VALUES(`remark`);

-- 2) 存量贈送ID映射表：前綴按廣告類型取，日期段取創建日期，序號接該 (前綴, 日期) 已有最大序號繼續
DROP TEMPORARY TABLE IF EXISTS tmp_gift_id_map;
CREATE TEMPORARY TABLE tmp_gift_id_map AS
SELECT t.id, t.gift_id AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, gift_id, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT g.id, g.gift_id, g.created_at,
               CASE g.ad_type WHEN 'new_store'        THEN 'XDZS'
                              WHEN 'revival'          THEN 'PHZS'
                              WHEN 'popular_merchant' THEN 'RQZS'
                              WHEN 'ka'               THEN 'RQZS'
                              WHEN 'golden_signboard' THEN 'JZZS'
                              WHEN 'traffic_ad'       THEN 'TLZS' END AS prefix
        FROM biz_gift_record g
        WHERE g.gift_id IS NULL
           OR g.gift_id NOT REGEXP '^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$'
    ) x
    WHERE x.prefix IS NOT NULL
) t
LEFT JOIN (
    SELECT LEFT(gift_id, 4) AS prefix, MID(gift_id, 5, 8) AS dkey,
           MAX(CAST(RIGHT(gift_id, 4) AS UNSIGNED)) AS maxseq
    FROM biz_gift_record
    WHERE gift_id REGEXP '^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$'
    GROUP BY LEFT(gift_id, 4), MID(gift_id, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

-- 3) 回填贈送ID與消費流水快照
UPDATE biz_gift_record g JOIN tmp_gift_id_map m ON g.id = m.id
SET g.gift_id = m.new_code;

UPDATE biz_gift_consume c JOIN tmp_gift_id_map m ON c.gift_record_id = m.id
SET c.gift_id = m.new_code;

-- 4) 對齊 sys_biz_seq 計數（seq_start=0 規則下 current_value = 最大序號 + 1，與運行期生成器同口徑）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(new_code, 4), MID(new_code, 5, 8), MAX(CAST(RIGHT(new_code, 4) AS UNSIGNED)) + 1
FROM tmp_gift_id_map
GROUP BY LEFT(new_code, 4), MID(new_code, 5, 8)
AS new
ON DUPLICATE KEY UPDATE current_value = GREATEST(sys_biz_seq.current_value, new.current_value);

-- 5) 清理舊生成器遺留的孤兒計數行（GZ 已無對應規則）
DELETE s FROM sys_biz_seq s
WHERE s.prefix = 'GZ'
  AND NOT EXISTS (SELECT 1 FROM (SELECT prefix FROM sys_biz_seq_rule WHERE prefix = 'GZ') t);

-- 6) 核對結果：應為 0 筆（可映射廣告類型的存量贈送ID都已符合現行格式）
SELECT COUNT(*) AS remaining_legacy_gift_id
FROM biz_gift_record
WHERE ad_type IN ('new_store', 'revival', 'popular_merchant', 'ka', 'golden_signboard', 'traffic_ad')
  AND (gift_id IS NULL OR gift_id NOT REGEXP '^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$');
-- =============================================================
-- 226_gift_ad_type_seq_rules.sql
-- 贈送ID口徑收口（一次性參考文檔）
--   實際執行與冪等保證由後端 BizSeqRuleInitializer 的 seq:init-v19 遷移負責，
--   本腳本僅供 DBA 人工核對與離線環境手動執行使用。
--
-- 背景:
--   「新增贈送」可選的廣告類型與後端 BizSeqService.giftRuleKey 支持的類型不一致——
--   金字招牌(golden_signboard)/投流廣告(traffic_ad) 在廣告銷售下單時會按 adType 查贈送天數抵扣，
--   但既沒有贈送ID編號規則、也無法生成贈送ID，導致這兩個模組的贈送能力斷鏈（抵扣恆為 0）。
--
-- 1. 登記 5 條贈送ID編號規則到「推廣贈送」菜單（XDZS/RQZS/PHZS/JZZS/TLZS）
--    取代 33_biz_seq_rule.sql 中只有 3 條的舊寫法
-- 2. 存量贈送ID回填：不符合現行格式（前綴 + YYYYMMDD + 4位序號）的 gift_id 按創建日期重新取號
-- 3. biz_gift_consume 的贈送ID快照按外鍵同步（舊數據 gift_id 可能為 NULL，按快照值匹配會漏行）
-- 4. sys_biz_seq 計數對齊，避免運行期生成器重號
-- 5. 清理舊贈送ID生成器殘留的 GZ 孤兒計數行（僅當已無任何規則使用該前綴）
--
-- 執行須知:
--   1. MySQL 8.0+（使用窗口函數），執行前請先備份 biz_gift_record / biz_gift_consume
--   2. 冪等: 已符合現行格式的編號不會被重復改寫；規則行按 rule_key 覆蓋更新
--   3. 廣告類型無法映射到規則的記錄一律跳過並需人工核對，不猜測前綴
-- =============================================================

-- 1) 登記 5 條贈送ID編號規則（rule_key 唯一鍵冪等覆蓋；前綴唯一鍵要求 JZZS/TLZS 未被佔用）
INSERT INTO `sys_biz_seq_rule`
    (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `status`, `remark`)
VALUES
    ('gift_new_store', '新店廣告贈送ID', '推廣贈送', 'XDZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_popular',   '人氣商家贈送ID', '推廣贈送', 'RQZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_revive',    '盤活復蘇贈送ID', '推廣贈送', 'PHZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_signboard', '金字招牌贈送ID', '推廣贈送', 'JZZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
    ('gift_traffic',   '投流廣告贈送ID', '推廣贈送', 'TLZS', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE
    `rule_name`   = VALUES(`rule_name`),
    `biz_menu`    = VALUES(`biz_menu`),
    `prefix`      = VALUES(`prefix`),
    `date_format` = VALUES(`date_format`),
    `seq_length`  = VALUES(`seq_length`),
    `seq_start`   = VALUES(`seq_start`),
    `status`      = VALUES(`status`),
    `remark`      = VALUES(`remark`);

-- 2) 存量贈送ID映射表：前綴按廣告類型取，日期段取創建日期，序號接該 (前綴, 日期) 已有最大序號繼續
DROP TEMPORARY TABLE IF EXISTS tmp_gift_id_map;
CREATE TEMPORARY TABLE tmp_gift_id_map AS
SELECT t.id, t.gift_id AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, gift_id, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT g.id, g.gift_id, g.created_at,
               CASE g.ad_type WHEN 'new_store'        THEN 'XDZS'
                              WHEN 'revival'          THEN 'PHZS'
                              WHEN 'popular_merchant' THEN 'RQZS'
                              WHEN 'ka'               THEN 'RQZS'
                              WHEN 'golden_signboard' THEN 'JZZS'
                              WHEN 'traffic_ad'       THEN 'TLZS' END AS prefix
        FROM biz_gift_record g
        WHERE g.gift_id IS NULL
           OR g.gift_id NOT REGEXP '^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$'
    ) x
    WHERE x.prefix IS NOT NULL
) t
LEFT JOIN (
    SELECT LEFT(gift_id, 4) AS prefix, MID(gift_id, 5, 8) AS dkey,
           MAX(CAST(RIGHT(gift_id, 4) AS UNSIGNED)) AS maxseq
    FROM biz_gift_record
    WHERE gift_id REGEXP '^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$'
    GROUP BY LEFT(gift_id, 4), MID(gift_id, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

-- 3a) 回填贈送記錄的贈送ID
UPDATE biz_gift_record g JOIN tmp_gift_id_map m ON g.id = m.id
SET g.gift_id = m.new_code;

-- 3b) 同步消費流水的贈送ID快照（按外鍵匹配，舊快照值可能為 NULL）
UPDATE biz_gift_consume c JOIN tmp_gift_id_map m ON c.gift_record_id = m.id
SET c.gift_id = m.new_code;

-- 4) 對齊 sys_biz_seq 計數（seq_start=0 規則下 current_value = 最大序號 + 1，與運行期生成器同口徑）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(new_code, 4), MID(new_code, 5, 8), MAX(CAST(RIGHT(new_code, 4) AS UNSIGNED)) + 1
FROM tmp_gift_id_map
GROUP BY LEFT(new_code, 4), MID(new_code, 5, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 5) 清理舊生成器遺留的孤兒計數行（GZ 已無對應規則；派生表繞開 MySQL 同表子查詢限制）
DELETE FROM sys_biz_seq
WHERE prefix = 'GZ'
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_biz_seq_rule WHERE prefix = 'GZ') t);

-- 6) 核對結果：應為 0 筆（可映射廣告類型的存量贈送ID都已符合現行格式）
SELECT COUNT(*) AS remaining_legacy_gift_id
FROM biz_gift_record
WHERE ad_type IN ('new_store', 'revival', 'popular_merchant', 'ka', 'golden_signboard', 'traffic_ad')
  AND (gift_id IS NULL OR gift_id NOT REGEXP '^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$');

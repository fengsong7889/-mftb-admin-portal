-- =============================================================
-- 224_traffic_algo_prefix_sftl.sql
-- 投流廣告編號規則修正（一次性參考文檔）
--   實際執行與冪等保證由後端 BizSeqRuleInitializer 的 seq:init-v18 遷移負責，
--   本腳本僅供 DBA 人工核對與離線環境手動執行使用。
--
-- 1. algo_traffic 算法ID前綴 SFLL → SFTL（投流拼音首字母，與 SFX* 系列同構）
--    取代 33_biz_seq_rule.sql / 70_traffic_ad.sql 中的舊前綴寫法
-- 2. sys_biz_seq 舊前綴計數沿用，避免切換後同日序號從 000 重起導致重號
-- 3. 存量算法編號 + 訂單算法編號快照回填（算法下拉以 algoCode 為 value，必須同步）
-- 4. 銷售定價菜單的 5 個廣告定價規則統一登記（DJWD/DJRQ/DJPH/DJZP/DJTL），
--    使「規則中心 → 編號生成規則」按所屬菜單篩選「銷售定價」時 5 條全在
-- =============================================================

-- 1) 算法ID規則前綴改名（uk_seq_rule_prefix 要求 SFTL 未被佔用，執行前先確認）
UPDATE `sys_biz_seq_rule`
SET `prefix` = 'SFTL', `rule_name` = '投流廣告算法ID'
WHERE `rule_key` = 'algo_traffic' AND `prefix` <> 'SFTL';

-- 2a) 新前綴已有計數的日期：取較大值，保證續號不重號
UPDATE `sys_biz_seq` n
JOIN (
    SELECT `date_key`, MAX(`current_value`) AS max_old
    FROM `sys_biz_seq` WHERE `prefix` = 'SFLL' GROUP BY `date_key`
) o ON o.`date_key` = n.`date_key`
SET n.`current_value` = GREATEST(n.`current_value`, o.max_old)
WHERE n.`prefix` = 'SFTL';

-- 2b) 新前綴尚未計數的日期：直接把舊計數行改名沿用（派生表規避 MySQL 同表子查詢限制）
UPDATE `sys_biz_seq`
SET `prefix` = 'SFTL'
WHERE `prefix` = 'SFLL'
  AND `date_key` NOT IN (
      SELECT d.`dk` FROM (SELECT `date_key` AS dk FROM `sys_biz_seq` WHERE `prefix` = 'SFTL') d
  );

-- 3) 存量編號回填（SUBSTRING 從第 5 位起，即去掉 4 字符舊前綴 SFLL）
UPDATE `biz_ad_algorithm`
SET `algo_code` = CONCAT('SFTL', SUBSTRING(`algo_code`, 5))
WHERE `algo_code` LIKE 'SFLL%';

UPDATE `biz_ad_order`
SET `algo_code` = CONCAT('SFTL', SUBSTRING(`algo_code`, 5))
WHERE `algo_code` LIKE 'SFLL%';

-- 4) 銷售定價 5 個定價規則登記（缺失補行，已存在則統一歸屬菜單與格式）
INSERT INTO `sys_biz_seq_rule`
    (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `status`, `remark`) VALUES
('config_pricing_star',     '無敵星星定價', '銷售定價', 'DJWD', 'YYYYMMDD', 3, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
('config_pricing_hot',      '人氣商家定價', '銷售定價', 'DJRQ', 'YYYYMMDD', 3, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
('config_pricing_revive',   '盤活復蘇定價', '銷售定價', 'DJPH', 'YYYYMMDD', 3, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
('config_pricing_signboard','金字招牌定價', '銷售定價', 'DJZP', 'YYYYMMDD', 3, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號'),
('config_pricing_traffic',  '投流廣告定價', '銷售定價', 'DJTL', 'YYYYMMDD', 3, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE
    `rule_name` = VALUES(`rule_name`), `biz_menu` = VALUES(`biz_menu`), `prefix` = VALUES(`prefix`),
    `date_format` = VALUES(`date_format`), `seq_length` = VALUES(`seq_length`),
    `seq_start` = VALUES(`seq_start`), `remark` = VALUES(`remark`), `status` = VALUES(`status`);

-- 5) 校驗：應返回 1 條 algo_traffic(SFTL) + 5 條銷售定價規則，且無 SFLL 殘留
SELECT `rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`
FROM `sys_biz_seq_rule`
WHERE `rule_key` = 'algo_traffic' OR `prefix` = 'SFLL' OR `biz_menu` = '銷售定價';

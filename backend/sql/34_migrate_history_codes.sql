-- =============================================================
-- 34_migrate_history_codes.sql
-- 历史编号按「编号生成规则」(sys_biz_seq_rule / 前端规则配置界面) 统一改写
--
-- 执行须知:
--   1. MySQL 8.0+（使用窗口函数），执行前请先备份数据库
--   2. 脚本幂等: 已符合新格式的编号不会被重复改写
--   3. 日期段取自各记录 created_at；序号按 (前缀, 日期) 分组、id 升序重排，
--      且接着该日已有新格式编号的最大序号继续，避免与部署后新数据撞号
--   4. 各表中的编号快照字段(订单/消耗/明细/欠款单)一并同步
--   5. 末尾同步 sys_biz_seq 序号表，防止后续生成重号
--
-- 已符合规则、无需迁移: 流程编号 CZ/KK/ZZ/HB、明细 MX、欠款单 QK、
--   集团 JT、门店 MD、工号 MF（MF 中极少量非 MF 历史账号由本脚本第 6 节处理）
-- =============================================================

SET @start_ts = NOW();
SELECT CONCAT('开始迁移历史编号: ', @start_ts) AS info;

DROP TEMPORARY TABLE IF EXISTS tmp_algo_map;
DROP TEMPORARY TABLE IF EXISTS tmp_order_map;
DROP TEMPORARY TABLE IF EXISTS tmp_batch_map;
DROP TEMPORARY TABLE IF EXISTS tmp_gift_map;
DROP TEMPORARY TABLE IF EXISTS tmp_emp_map;

-- =============================================================
-- 1. 算法ID: biz_ad_algorithm.algo_code → SFxx + YYYYMMDD + 3位
-- =============================================================
CREATE TEMPORARY TABLE tmp_algo_map AS
SELECT t.id, t.algo_code AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 3, '0')) AS new_code
FROM (
    SELECT id, algo_code, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT id, algo_code, created_at,
               CASE algo_type WHEN 1 THEN 'SFWD' WHEN 2 THEN 'SFXD' WHEN 3 THEN 'SFPH'
                              WHEN 15 THEN 'SFLL' WHEN 5 THEN 'SFRQ' WHEN 4 THEN 'SFDJ'
                              WHEN 6 THEN 'SFXH' WHEN 7 THEN 'SFZR' WHEN 11 THEN 'SFPP' END AS prefix
        FROM biz_ad_algorithm
        WHERE algo_type IN (1, 2, 3, 4, 5, 6, 7, 11, 15)
          AND (algo_code IS NULL OR algo_code NOT REGEXP '^SF[A-Z]{2}[0-9]{11}$')
    ) x
) t
LEFT JOIN (
    SELECT LEFT(algo_code, 4) AS prefix, MID(algo_code, 5, 8) AS dkey,
           MAX(CAST(RIGHT(algo_code, 3) AS UNSIGNED)) AS maxseq
    FROM biz_ad_algorithm
    WHERE algo_code REGEXP '^SF[A-Z]{2}[0-9]{11}$'
    GROUP BY LEFT(algo_code, 4), MID(algo_code, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

UPDATE biz_ad_algorithm a JOIN tmp_algo_map m ON a.id = m.id
SET a.algo_code = m.new_code;
-- 快照同步: 订单表算法编码、赠送消耗表算法ID
UPDATE biz_ad_order o JOIN tmp_algo_map m ON o.algo_code = m.old_code
SET o.algo_code = m.new_code;
UPDATE biz_gift_consume c JOIN tmp_algo_map m ON c.algorithm_id = m.old_code
SET c.algorithm_id = m.new_code;

-- =============================================================
-- 2. 广告订单号: biz_ad_order.order_no → DDxx + YYYYMMDD + 4位
-- =============================================================
CREATE TEMPORARY TABLE tmp_order_map AS
SELECT t.id, t.order_no AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, order_no, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT id, order_no, created_at,
               CASE algo_type WHEN 1 THEN 'DDWD' WHEN 2 THEN 'DDXD' WHEN 3 THEN 'DDPH'
                              WHEN 15 THEN 'DDLL' WHEN 5 THEN 'DDRQ' END AS prefix
        FROM biz_ad_order
        WHERE algo_type IN (1, 2, 3, 15, 5)
          AND (order_no IS NULL OR order_no NOT REGEXP '^(DDWD|DDXD|DDPH|DDLL|DDRQ)[0-9]{12}$')
    ) x
) t
LEFT JOIN (
    SELECT LEFT(order_no, 4) AS prefix, MID(order_no, 5, 8) AS dkey,
           MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) AS maxseq
    FROM biz_ad_order
    WHERE order_no REGEXP '^(DDWD|DDXD|DDPH|DDLL|DDRQ)[0-9]{12}$'
    GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

UPDATE biz_ad_order o JOIN tmp_order_map m ON o.id = m.id
SET o.order_no = m.new_code;
-- 快照同步: 赠送消耗表订单号
UPDATE biz_gift_consume c JOIN tmp_order_map m ON c.order_no = m.old_code
SET c.order_no = m.new_code;

-- =============================================================
-- 3. 财务批次号: biz_fin_batch.batch_no → CZPC/ZZPC/HBPC + YYYYMMDD + 4位
-- =============================================================
CREATE TEMPORARY TABLE tmp_batch_map AS
SELECT t.id, t.batch_no AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, batch_no, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT id, batch_no, created_at,
               CASE batch_type WHEN 'recharge' THEN 'CZPC' WHEN 'transfer' THEN 'ZZPC'
                               WHEN 'merge' THEN 'HBPC' END AS prefix
        FROM biz_fin_batch
        WHERE batch_type IN ('recharge', 'transfer', 'merge')
          AND (batch_no IS NULL OR batch_no NOT REGEXP '^(CZPC|ZZPC|HBPC)[0-9]{12}$')
    ) x
) t
LEFT JOIN (
    SELECT LEFT(batch_no, 4) AS prefix, MID(batch_no, 5, 8) AS dkey,
           MAX(CAST(RIGHT(batch_no, 4) AS UNSIGNED)) AS maxseq
    FROM biz_fin_batch
    WHERE batch_no REGEXP '^(CZPC|ZZPC|HBPC)[0-9]{12}$'
    GROUP BY LEFT(batch_no, 4), MID(batch_no, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

UPDATE biz_fin_batch f JOIN tmp_batch_map m ON f.id = m.id
SET f.batch_no = m.new_code;
-- 快照同步: 交易明细、欠款单中的批次号
UPDATE biz_fin_detail d JOIN tmp_batch_map m ON d.batch_no = m.old_code
SET d.batch_no = m.new_code;
UPDATE biz_fin_debt_bill q JOIN tmp_batch_map m ON q.batch_no = m.old_code
SET q.batch_no = m.new_code;

-- =============================================================
-- 4. 赠送ID: biz_gift_record.gift_id → XDZS/PHZS/RQZS + YYYYMMDD + 4位
-- =============================================================
CREATE TEMPORARY TABLE tmp_gift_map AS
SELECT t.id, t.gift_id AS old_code,
       CONCAT(t.prefix, t.dkey, LPAD(t.rn + COALESCE(b.maxseq, -1), 4, '0')) AS new_code
FROM (
    SELECT id, gift_id, DATE_FORMAT(created_at, '%Y%m%d') AS dkey, prefix,
           ROW_NUMBER() OVER (PARTITION BY prefix, DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
    FROM (
        SELECT id, gift_id, created_at,
               CASE ad_type WHEN 'new_store' THEN 'XDZS' WHEN 'revival' THEN 'PHZS'
                            WHEN 'ka' THEN 'RQZS' END AS prefix
        FROM biz_gift_record
        WHERE ad_type IN ('new_store', 'revival', 'ka')
          AND (gift_id IS NULL OR gift_id NOT REGEXP '^(XDZS|PHZS|RQZS)[0-9]{12}$')
    ) x
) t
LEFT JOIN (
    SELECT LEFT(gift_id, 4) AS prefix, MID(gift_id, 5, 8) AS dkey,
           MAX(CAST(RIGHT(gift_id, 4) AS UNSIGNED)) AS maxseq
    FROM biz_gift_record
    WHERE gift_id REGEXP '^(XDZS|PHZS|RQZS)[0-9]{12}$'
    GROUP BY LEFT(gift_id, 4), MID(gift_id, 5, 8)
) b ON b.prefix = t.prefix AND b.dkey = t.dkey;

UPDATE biz_gift_record g JOIN tmp_gift_map m ON g.id = m.id
SET g.gift_id = m.new_code;
-- 快照同步: 赠送消耗表赠送ID
UPDATE biz_gift_consume c JOIN tmp_gift_map m ON c.gift_id = m.old_code
SET c.gift_id = m.new_code;

-- =============================================================
-- 5. 新增编号字段回填（历史数据为 NULL）
-- =============================================================
-- 5.1 瀑布流策略编号 PB + YYYYMMDD + 3位
UPDATE biz_ad_waterfall w
JOIN (
    SELECT id, CONCAT('PB', DATE_FORMAT(created_at, '%Y%m%d'), LPAD(rn - 1, 3, '0')) AS code
    FROM (
        SELECT id, created_at,
               ROW_NUMBER() OVER (PARTITION BY DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
        FROM biz_ad_waterfall
        WHERE strategy_code IS NULL OR strategy_code = ''
    ) x
) n ON w.id = n.id
SET w.strategy_code = n.code;

-- 5.2 定价编号 DJWD/DJRQ/DJPH + YYYYMMDD + 3位
UPDATE biz_ad_pricing_star p
JOIN (
    SELECT id, CONCAT('DJWD', DATE_FORMAT(created_at, '%Y%m%d'), LPAD(rn - 1, 3, '0')) AS code
    FROM (
        SELECT id, created_at,
               ROW_NUMBER() OVER (PARTITION BY DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
        FROM biz_ad_pricing_star
        WHERE pricing_no IS NULL OR pricing_no = ''
    ) x
) n ON p.id = n.id
SET p.pricing_no = n.code;

UPDATE biz_ad_pricing_hot p
JOIN (
    SELECT id, CONCAT('DJRQ', DATE_FORMAT(created_at, '%Y%m%d'), LPAD(rn - 1, 3, '0')) AS code
    FROM (
        SELECT id, created_at,
               ROW_NUMBER() OVER (PARTITION BY DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
        FROM biz_ad_pricing_hot
        WHERE pricing_no IS NULL OR pricing_no = ''
    ) x
) n ON p.id = n.id
SET p.pricing_no = n.code;

UPDATE biz_ad_pricing_revive p
JOIN (
    SELECT id, CONCAT('DJPH', DATE_FORMAT(created_at, '%Y%m%d'), LPAD(rn - 1, 3, '0')) AS code
    FROM (
        SELECT id, created_at,
               ROW_NUMBER() OVER (PARTITION BY DATE_FORMAT(created_at, '%Y%m%d') ORDER BY id) AS rn
        FROM biz_ad_pricing_revive
        WHERE pricing_no IS NULL OR pricing_no = ''
    ) x
) n ON p.id = n.id
SET p.pricing_no = n.code;

-- =============================================================
-- 6. 组织架构: 部门编码 BM、职位ID ZW、工号 MF（全局自增，取表内最大序号续编）
-- =============================================================
-- 6.1 部门编码: 非 BM 格式统一改写为 BM + 5位（按 id 升序，接着已有 BM 最大序号续编）
UPDATE sys_department d
JOIN (
    SELECT t.id, CONCAT('BM', LPAD(t.rn + COALESCE(b.maxseq, 0), 5, '0')) AS new_code
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM sys_department
        WHERE code NOT REGEXP '^BM[0-9]+$'
    ) t
    LEFT JOIN (
        SELECT MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)) AS maxseq
        FROM sys_department
        WHERE code REGEXP '^BM[0-9]+$'
    ) b ON TRUE
) n ON d.id = n.id
SET d.code = n.new_code;

-- 6.2 职位ID: 空值回填 ZW + 5位（按 id 升序续编）
UPDATE sys_position p
JOIN (
    SELECT t.id, CONCAT('ZW', LPAD(t.rn + COALESCE(b.maxseq, 0), 5, '0')) AS new_code
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM sys_position
        WHERE code IS NULL OR code = '' OR code NOT REGEXP '^ZW[0-9]+$'
    ) t
    LEFT JOIN (
        SELECT MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)) AS maxseq
        FROM sys_position
        WHERE code REGEXP '^ZW[0-9]+$'
    ) b ON TRUE
) n ON p.id = n.id
SET p.code = n.new_code;

-- 6.3 工号: 非 MF 格式的历史账号重编号为 MF + 5位（登录账号与工号同步）
CREATE TEMPORARY TABLE tmp_emp_map AS
SELECT t.id, CONCAT('MF', LPAD(t.rn + COALESCE(b.maxseq, 0), 5, '0')) AS new_id
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM sys_user
    WHERE username NOT REGEXP '^MF[0-9]+$'
) t
LEFT JOIN (
    SELECT MAX(CAST(SUBSTRING(username, 3) AS UNSIGNED)) AS maxseq
    FROM sys_user
    WHERE username REGEXP '^MF[0-9]+$'
) b ON TRUE;

UPDATE sys_user u JOIN tmp_emp_map m ON u.id = m.id
SET u.username = m.new_id, u.emp_id = m.new_id;

-- =============================================================
-- 7. 同步 sys_biz_seq 序号表（current_value = 已用最大显示序号 + 1，防止后续生成撞号）
-- =============================================================
-- 订单 DDxx（序号4位）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(order_no, 4), MID(order_no, 5, 8), MAX(CAST(RIGHT(order_no, 4) AS UNSIGNED)) + 1
FROM biz_ad_order
WHERE order_no REGEXP '^(DDWD|DDXD|DDPH|DDLL|DDRQ)[0-9]{12}$'
GROUP BY LEFT(order_no, 4), MID(order_no, 5, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 算法 SFxx（序号3位）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(algo_code, 4), MID(algo_code, 5, 8), MAX(CAST(RIGHT(algo_code, 3) AS UNSIGNED)) + 1
FROM biz_ad_algorithm
WHERE algo_code REGEXP '^SF[A-Z]{2}[0-9]{11}$'
GROUP BY LEFT(algo_code, 4), MID(algo_code, 5, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 批次 CZPC/ZZPC/HBPC（序号4位）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(batch_no, 4), MID(batch_no, 5, 8), MAX(CAST(RIGHT(batch_no, 4) AS UNSIGNED)) + 1
FROM biz_fin_batch
WHERE batch_no REGEXP '^(CZPC|ZZPC|HBPC)[0-9]{12}$'
GROUP BY LEFT(batch_no, 4), MID(batch_no, 5, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 赠送 XDZS/PHZS/RQZS（序号4位）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(gift_id, 4), MID(gift_id, 5, 8), MAX(CAST(RIGHT(gift_id, 4) AS UNSIGNED)) + 1
FROM biz_gift_record
WHERE gift_id REGEXP '^(XDZS|PHZS|RQZS)[0-9]{12}$'
GROUP BY LEFT(gift_id, 4), MID(gift_id, 5, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 瀑布流 PB（序号3位）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT 'PB', MID(strategy_code, 3, 8), MAX(CAST(RIGHT(strategy_code, 3) AS UNSIGNED)) + 1
FROM biz_ad_waterfall
WHERE strategy_code REGEXP '^PB[0-9]{11}$'
GROUP BY MID(strategy_code, 3, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 定价 DJxx（序号3位）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT LEFT(pricing_no, 4), MID(pricing_no, 5, 8), MAX(CAST(RIGHT(pricing_no, 3) AS UNSIGNED)) + 1
FROM (
    SELECT pricing_no FROM biz_ad_pricing_star WHERE pricing_no REGEXP '^DJWD[0-9]{11}$'
    UNION ALL
    SELECT pricing_no FROM biz_ad_pricing_hot WHERE pricing_no REGEXP '^DJRQ[0-9]{11}$'
    UNION ALL
    SELECT pricing_no FROM biz_ad_pricing_revive WHERE pricing_no REGEXP '^DJPH[0-9]{11}$'
) p
GROUP BY LEFT(pricing_no, 4), MID(pricing_no, 5, 8)
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 门店 MD（无日期维度, seq_start=1, 表内最大值即 current_value）
INSERT INTO sys_biz_seq (prefix, date_key, current_value)
SELECT 'MD', '00000000', MAX(CAST(SUBSTRING(store_code, 3) AS UNSIGNED))
FROM biz_store
WHERE store_code REGEXP '^MD[0-9]+$'
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

DROP TEMPORARY TABLE IF EXISTS tmp_algo_map;
DROP TEMPORARY TABLE IF EXISTS tmp_order_map;
DROP TEMPORARY TABLE IF EXISTS tmp_batch_map;
DROP TEMPORARY TABLE IF EXISTS tmp_gift_map;
DROP TEMPORARY TABLE IF EXISTS tmp_emp_map;

SELECT CONCAT('历史编号迁移完成, 耗时: ', TIMEDIFF(NOW(), @start_ts)) AS info;

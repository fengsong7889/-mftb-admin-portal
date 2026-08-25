-- =============================================================
-- 54_golden_signboard_seq_rule.sql
-- 补充算法库编号生成规则种子数据（点金广告 / 金字招牌 / 商品促销）
-- 33_biz_seq_rule.sql 初始种子仅到 algo_brand，后续新增的算法类型规则需补录
-- 使用 INSERT IGNORE 保证幂等（已存在则跳过）
-- =============================================================

INSERT IGNORE INTO `sys_biz_seq_rule` (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `remark`) VALUES
('algo_gold',      '點金廣告算法ID',   '算法庫', 'SFJD', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_signboard', '金字招牌算法ID',   '算法庫', 'SFJZ', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_promo',     '商品促銷算法ID',   '算法庫', 'SFSP', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號');

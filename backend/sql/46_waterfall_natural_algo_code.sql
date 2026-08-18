-- 45_waterfall_natural_algo_code.sql
-- 瀑布流策略 naturalAlgoId 从数字主键改为算法编码（与坑位 slot algoId 保持一致）
-- 影响表: biz_ad_waterfall

-- 1. 修改列类型为 varchar(64)
ALTER TABLE biz_ad_waterfall
MODIFY COLUMN natural_algo_id VARCHAR(64) DEFAULT NULL COMMENT '自然流量兜底算法编码（关联 biz_ad_algorithm.algo_code）';

-- 2. 迁移已有数据：将数字ID转换为对应的 algo_code
UPDATE biz_ad_waterfall w
  JOIN biz_ad_algorithm a ON w.natural_algo_id = CAST(a.id AS CHAR)
  SET w.natural_algo_id = a.algo_code
WHERE w.deleted = 0
  AND w.natural_algo_id IS NOT NULL;

-- 注：如果已有数据的 natural_algo_id 存储的是数字格式（如 "5"），
-- 上面的 JOIN 条件可以匹配。如果已经是 algo_code 格式则无需转换。

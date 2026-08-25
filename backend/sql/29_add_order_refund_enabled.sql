-- 订单表新增 refund_enabled 列（退款开关快照）
-- 下单时从计价配置快照，防止配置变更后影响历史订单的退款权限
ALTER TABLE biz_ad_order ADD COLUMN refund_enabled INT DEFAULT NULL COMMENT '退款开关快照: 1=允许退款 2=不允许';

-- 回填历史数据：从当前计价配置读取 refund_enabled
-- 無敵星星订单
UPDATE biz_ad_order o
INNER JOIN biz_ad_pricing_star p ON o.algo_id = p.id
SET o.refund_enabled = p.refund_enabled
WHERE o.algo_type = 1 AND o.refund_enabled IS NULL;

-- 盤活復蘇订单
UPDATE biz_ad_order o
INNER JOIN biz_ad_pricing_revive p ON o.algo_id = p.id
SET o.refund_enabled = p.refund_enabled
WHERE o.algo_type = 3 AND o.refund_enabled IS NULL;

-- 人氣商家订单
UPDATE biz_ad_order o
INNER JOIN biz_ad_pricing_hot p ON o.algo_id = p.id
SET o.refund_enabled = p.refund_enabled
WHERE o.algo_type = 5 AND o.refund_enabled IS NULL;

-- 金字招牌订单
UPDATE biz_ad_order o
INNER JOIN biz_ad_pricing_signboard p ON o.algo_id = p.id
SET o.refund_enabled = p.refund_enabled
WHERE o.algo_type = 13 AND o.refund_enabled IS NULL;

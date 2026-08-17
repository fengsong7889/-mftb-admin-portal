-- 42. 人气商家定价表 algo_id 允许 NULL
-- 背景：
--   人气商家已解耦算法库，定价配置不再关联算法记录。
--   前端不再发送 algoId，后端 applyRequest 也不再强制设置 algoId。
--   但 biz_ad_pricing_hot.algo_id 列仍为 NOT NULL，导致新增时报 SQL 错误：
--   "Column 'algo_id' cannot be null"。
-- 修复：将 algo_id 改为允许 NULL。

ALTER TABLE biz_ad_pricing_hot
    MODIFY COLUMN algo_id BIGINT NULL COMMENT '关联算法ID（已解耦，可为空）';

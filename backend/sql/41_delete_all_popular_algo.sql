-- 41. 硬删除算法库中所有人气商家类型记录及关联的定价/皮肤数据
-- 背景：
--   人气商家已解耦算法库，定价配置不再关联算法记录。
--   购买页面改为从销售定价配置获取人气名称，算法库中的人气商家条目不再使用。
--   人气商家算法库之前配置的所有数据（算法记录、定价主表、皮肤明细）全部硬删除。

-- Step 1: 硬删除所有人气商家皮肤计价明细
DELETE FROM biz_ad_pricing_hot_skin;

-- Step 2: 硬删除所有人气商家定价主表记录
DELETE FROM biz_ad_pricing_hot;

-- Step 3: 硬删除所有人气商家类型的算法记录
DELETE FROM biz_ad_algorithm
WHERE algo_type = 5;

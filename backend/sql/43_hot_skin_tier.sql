-- 43. 人气商家皮肤计价表新增皮肤段位字段
-- 背景：皮肤按段位分级（经典/精选/旗舰/至尊），等级越高视觉效果越好、价格越贵，
--       商家选择时一目了然。

-- 1. biz_ad_pricing_hot_skin 新增 tier 列
ALTER TABLE biz_ad_pricing_hot_skin
    ADD COLUMN tier VARCHAR(20) DEFAULT 'classic' COMMENT '皮肤段位: classic=经典 premium=精选 flagship=旗舰 ultimate=至尊'
    AFTER dish_layout;

-- 2. 已有数据默认填充 classic（经典版）
UPDATE biz_ad_pricing_hot_skin SET tier = 'classic' WHERE tier IS NULL;

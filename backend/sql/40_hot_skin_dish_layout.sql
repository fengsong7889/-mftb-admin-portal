-- 40. 人气商家皮肤计价表新增菜品展示布局字段
-- 背景：菜品展示布局从原来的多选改为单选（商家自购时选择一种布局），
--       每条皮肤记录需存储其对应的展示布局类型。

-- 1. biz_ad_pricing_hot_skin 新增 dish_layout 列
ALTER TABLE biz_ad_pricing_hot_skin
    ADD COLUMN dish_layout VARCHAR(20) DEFAULT 'grid' COMMENT '菜品展示布局: grid=大图拼列(1大2小) carousel=阶梯轮播'
    AFTER border_color;

-- 2. 已有数据默认填充 grid（大图拼列）
UPDATE biz_ad_pricing_hot_skin SET dish_layout = 'grid' WHERE dish_layout IS NULL;

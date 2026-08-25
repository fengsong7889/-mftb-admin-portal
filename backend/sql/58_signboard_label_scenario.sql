-- 58. 金字招牌标签计价明细表增加场景字段
-- 背景：标签支持按场景分类（全澳對比/商圈對比/統計類），用于区分不同展示场景的定价
-- 执行时间：2026-08-25

-- 场景字段：all_macau=全澳對比, district=商圈對比, NULL=統計類無場景
ALTER TABLE biz_ad_pricing_signboard_label
  ADD COLUMN scenario VARCHAR(32) DEFAULT NULL
    COMMENT '场景（all_macau=全澳對比, district=商圈對比, NULL=統計類無場景）'
    AFTER label_type;

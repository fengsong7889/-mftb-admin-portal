-- 59. 金字招牌订单明细表添加 scenario 列
-- 支持对比类标签按场景（all_macau/district）独立下单，统计类标签为 NULL
ALTER TABLE biz_ad_order_item_signboard
  ADD COLUMN scenario VARCHAR(32) DEFAULT NULL
    COMMENT '场景（all_macau=全澳对比, district=商圈对比, NULL=统计类无场景）'
    AFTER label_type;

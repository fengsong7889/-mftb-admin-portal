-- 金字招牌計價明細表增加場景字段（支持標籤x場景粒度定價）
-- 對比類標籤（hot/popular/sales/rating/repurchase）：scenario = all_macau 或 district
-- 統計類標籤（favorites/customers）：scenario = NULL

ALTER TABLE biz_ad_pricing_signboard_label
  ADD COLUMN scenario VARCHAR(20) DEFAULT NULL COMMENT '場景：all_macau=全澳對比, district=商圈對比, NULL=統計類無場景'
  AFTER label_type;

-- 訂單明細表增加場景字段（為後續購買流程改造預留）
ALTER TABLE biz_ad_order_item_signboard
  ADD COLUMN scenario VARCHAR(20) DEFAULT NULL COMMENT '場景：all_macau/district/NULL'
  AFTER label_type;

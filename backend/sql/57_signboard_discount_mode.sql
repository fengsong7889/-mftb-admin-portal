-- 57. 金字招牌計價主表增加折扣模式字段
-- 背景：支持全局折扣（所有標籤共用同一梯度）和局部折扣（每個標籤獨立配置）兩種模式
-- 執行時間：2026-08-25
-- 注意：discount_mode 列可能已存在（首次執行報錯後重試），如報 Duplicate column name 可忽略該語句

-- 折扣模式：global=全局折扣（所有標籤共用） local=局部折扣（每個標籤獨立）
-- 若已存在會報 Error 1060，忽略即可
ALTER TABLE biz_ad_pricing_signboard
  ADD COLUMN discount_mode VARCHAR(10) NOT NULL DEFAULT 'local'
    COMMENT '折扣模式: global=全局折扣 local=局部折扣'
    AFTER cancel_fee_tiers;

-- 全局折扣梯度（僅 discount_mode=global 時生效），格式同標籤的 discount_tiers
ALTER TABLE biz_ad_pricing_signboard
  ADD COLUMN global_discount_tiers TEXT DEFAULT NULL
    COMMENT '全局折扣梯度JSON [{"minDays":3,"discount":95}]（discount_mode=global時生效）'
    AFTER discount_mode;

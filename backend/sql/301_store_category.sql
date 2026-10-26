-- 301: 门店新增品类字段（金字招牌「{品類}」文案数据源）
-- 用途：购买页标签文案按门店自身品类生成，如「全澳火鍋熱門店鋪」；
--       门店未配置品类时文案降级为不带品类（如「全澳熱門店鋪」）。
-- 字典：编码与中文名定义见 backend com.mftb.admin.constant.StoreCategory，
--       前端同源定义见 src/constants/storeCategory.ts，增删品类必须两端同步。
-- 说明：本脚本为一次性参考文档，实际幂等保证由 BizDataInitializer（versionKey: biz:store-category-v1.0）负责。
ALTER TABLE biz_store ADD COLUMN category VARCHAR(32) NULL
    COMMENT '门店品类编码（字典见 StoreCategory，如 hotpot=火鍋）' AFTER region;

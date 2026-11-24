# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 343: 团购商品星星订单——biz_ad_order 补推广对象与商品快照列
-- ---------------------------------------------------------------------------
-- 背景：商品维度订单不选门店（适用门店由团购业务系统预配置），订单归属
--       「集团+商品」；主表补推广对象与商品快照，明细复用 biz_ad_order_item_star，
--       meal_slot 存 'fullDay'（全天售卖，商圈×日期单格），不新建明细表。
--
-- 真值来源：本文件仅作参考文档；实际幂等补列 + 结构后置校验由 Java 迁移
--       AdPromotionDataInitializer#ensureStarOrderProductColumns（versionKey
--       adpromo:star_order_product_cols:v1）负责，并已登记 db/migrations/catalog.json；
--       列同时登记 LegacyCoreContracts 契约，每次启动自愈。
--
-- 兼容口径：存量外卖订单 target_type 默认 1=门店、商品列为空，语义即正确；无需回填。
-- ---------------------------------------------------------------------------

ALTER TABLE biz_ad_order ADD COLUMN target_type TINYINT NOT NULL DEFAULT 1
    COMMENT '推广对象快照: 1=门店 2=商品（下单时从星星算法协议推导）';
ALTER TABLE biz_ad_order ADD COLUMN product_id VARCHAR(64) DEFAULT NULL
    COMMENT '团购商品编码快照（仅商品订单；真实目录接入后为外部系统ID）';
ALTER TABLE biz_ad_order ADD COLUMN product_name VARCHAR(128) DEFAULT NULL
    COMMENT '团购商品名称快照（仅商品订单）';
ALTER TABLE biz_ad_order ADD KEY idx_ad_order_product (product_id);

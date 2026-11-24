# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 342: 无敌星星定价表补推广对象快照列（团购商品星星开放定价）
-- ---------------------------------------------------------------------------
-- 背景：商品星星（targetType=2）在团购到店频道开放销售定价后，定价列表与售卖链路
--       需要免解析算法 params 即可区分门店/商品记录；保存时由服务端从算法协议快照。
--
-- 真值来源：本文件仅作参考文档；实际幂等补列 + 结构后置校验由 Java 迁移
--       AdPromotionDataInitializer#ensureStarPricingTargetColumn（versionKey
--       adpromo:star_pricing_target_col:v1）负责，并已登记 db/migrations/catalog.json；
--       列同时登记 LegacyCoreContracts 契约，每次启动自愈。
--
-- 兼容口径：存量记录全部是门店定价，DEFAULT 1 即正确语义，无需回填。
-- ---------------------------------------------------------------------------

ALTER TABLE biz_ad_pricing_star ADD COLUMN target_type TINYINT NOT NULL DEFAULT 1
    COMMENT '推广对象快照: 1=门店 2=商品（保存时从星星算法协议推导）';

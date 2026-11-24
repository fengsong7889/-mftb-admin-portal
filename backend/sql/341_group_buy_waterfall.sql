# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 341: 团购到店瀑布流策略服务端化 —— biz_ad_waterfall 补业务线/展示维度/内容来源列
-- ---------------------------------------------------------------------------
-- 背景：团购瀑布流此前整体存前端本地（后端无业务线/展示维度/展示类目来源等字段），
--       无法被销售定价/选购/推荐执行引用。本迁移把团购链路所需配置落库：
--       业务线（外卖/团购）、展示维度（门店/商品）、展示类目数据来源（算法提供/类目/自定义）、
--       布局、业务频道、类目候选排序、类目兜底与固定展示内容坑位。
--
-- 真值来源：本文件仅作参考文档；实际幂等补列 + 结构后置校验由 Java 迁移
--       AdPromotionDataInitializer#ensureGroupBuyWaterfallColumns（versionKey
--       adpromo:groupbuy_waterfall_cols:v1）负责，并已登记 db/migrations/catalog.json；
--       biz_ad_waterfall 关键列同时登记 LegacyCoreContracts 契约，每次启动自愈。
--
-- 兼容口径：全部为 ADD COLUMN 带默认值，存量外卖记录 business_type=1/content_type=1，
--       旧读取方忽略新列即可，无需回填。序号 340 预留给相似推荐场景迁移，勿占用。
-- ---------------------------------------------------------------------------

ALTER TABLE biz_ad_waterfall ADD COLUMN business_type TINYINT NOT NULL DEFAULT 1
    COMMENT '业务线: 1=外卖到家 2=团购到店';
ALTER TABLE biz_ad_waterfall ADD COLUMN content_type TINYINT NOT NULL DEFAULT 1
    COMMENT '展示维度: 1=门店 2=商品（仅团购到店可为2）';
ALTER TABLE biz_ad_waterfall ADD COLUMN display_category_mode VARCHAR(16) DEFAULT NULL
    COMMENT '展示类目数据来源: algorithm=算法提供 category=类目 custom=自定义';
ALTER TABLE biz_ad_waterfall ADD COLUMN layout_columns TINYINT NOT NULL DEFAULT 1
    COMMENT '展示布局: 1=单列 2=双列';
ALTER TABLE biz_ad_waterfall ADD COLUMN biz_channel VARCHAR(16) DEFAULT NULL
    COMMENT '外卖业务频道: food/supermarket；团购固定 groupBuy';
ALTER TABLE biz_ad_waterfall ADD COLUMN sort_mode VARCHAR(16) DEFAULT NULL
    COMMENT '类目候选排序: score/sales/distance/random';
ALTER TABLE biz_ad_waterfall ADD COLUMN fallback_category_ids JSON DEFAULT NULL
    COMMENT '类目兜底ID数组(商品/门店类目模式；商品维度算法模式的兜底)';
ALTER TABLE biz_ad_waterfall ADD COLUMN fixed_slots JSON DEFAULT NULL
    COMMENT '固定展示内容坑位数组(custom模式: position/itemId/itemName/stock/status)';

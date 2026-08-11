-- 人氣商家皮膚計價增加邊框配置字段
-- 背景：購買頁皮膚套件需按定價配置的邊框顏色展示，皮膚計價明細需持久化邊框方式與顏色
-- 執行時間：2026-08-11

ALTER TABLE biz_ad_pricing_hot_skin
    ADD COLUMN border_type VARCHAR(16) DEFAULT 'color' COMMENT '边框方式: none=无边框 color=选择配色 image=上传边框图' AFTER price;

ALTER TABLE biz_ad_pricing_hot_skin
    ADD COLUMN border_color VARCHAR(32) DEFAULT NULL COMMENT '边框颜色(HEX, border_type=color时生效)' AFTER border_type;

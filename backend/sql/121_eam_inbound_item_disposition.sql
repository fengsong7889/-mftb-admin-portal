-- =====================================================================
-- 121: 驗收入庫批次明細增加驗收處置字段
--   1. disposition    — 驗收處置方式（pass / return / exchange / concession）
--   2. reject_reason  — 驗收不通過原因
-- 背景：前端支持驗收不通過（退貨/換貨/讓步接收），此前處置結果未落庫，
--       不通過物資在批次中無留痕，批次/訂單的退換貨統計無法累計。
-- =====================================================================

ALTER TABLE biz_eam_inbound_batch_item
    ADD COLUMN disposition   VARCHAR(20)  DEFAULT NULL COMMENT '驗收處置方式：pass=通過 / return=退貨 / exchange=換貨 / concession=讓步接收' AFTER asset_nos,
    ADD COLUMN reject_reason VARCHAR(500) DEFAULT NULL COMMENT '驗收不通過原因' AFTER disposition;

-- =====================================================================
-- 141: 驗收入庫模塊品牌/配件/資產照片擴展
--   1. biz_eam_inbound_batch.brand — 所屬品牌（創建批次時從採購訂單帶入）
--   2. biz_eam_inbound_batch_item.accessories — 配件清單 JSON 數組 [{name,qty}]
--   3. biz_eam_asset.images — 資產照片（Base64 Data URL，逗號分隔）
-- 背景：
--   - 批次記錄所屬品牌，驗收入庫列表/詳情與採購訂單字段保持一致；
--   - 驗收時錄入隨物資一同到貨的配件（充電線、說明書等），隨批次留痕；
--   - 驗收合格拍照作為憑證，同步寫入資產台賬（資產主圖），便於後續查詢。
-- =====================================================================

ALTER TABLE biz_eam_inbound_batch
    ADD COLUMN brand TINYINT DEFAULT NULL COMMENT '所屬品牌：1=閃蜂, 2=mFood' AFTER po_no;

ALTER TABLE biz_eam_inbound_batch_item
    ADD COLUMN accessories JSON DEFAULT NULL COMMENT '配件清單JSON數組 [{name,qty}]' AFTER photos;

ALTER TABLE biz_eam_asset
    ADD COLUMN images LONGTEXT DEFAULT NULL COMMENT '資產照片（Data URL，多張逗號分隔）' AFTER params;

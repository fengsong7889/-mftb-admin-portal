-- =====================================================================
-- 134_add_purchase_order_contact_phone.sql
-- 採購訂單表新增供應商聯絡人電話字段（冪等）
-- =====================================================================

-- 1. biz_eam_purchase_order 表新增 contact_phone 列（兼容舊數據）
ALTER TABLE biz_eam_purchase_order
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(64) DEFAULT NULL COMMENT '供應商聯絡人電話（兼容舊數據）';

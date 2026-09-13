-- =====================================================================
-- 123_eam_param_library.sql
-- 物資管理：參數庫（參數類型 + 參數值）
--
-- 包含：
--   1. biz_eam_param_type  — 參數類型（按分類維度管理，如 CPU / 內存 / 存儲）
--   2. biz_eam_param_value — 參數值（參數類型的可選項，如 A18 Pro / 16GB / 512GB）
-- =====================================================================

-- ── 1. 參數類型 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_param_type (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    category_code   VARCHAR(64)  NOT NULL COMMENT '所屬分類編碼（如 0101=手機, 0102=筆記本電腦）',
    code            VARCHAR(64)  NOT NULL COMMENT '參數編碼（分類內唯一，如 chip / memory / storage）',
    name            VARCHAR(100) NOT NULL COMMENT '參數名稱（如 芯片 / 內存 / 存儲）',
    unit            VARCHAR(32)  DEFAULT '' COMMENT '計量單位（如 GB / 英寸 / W）',
    value_type      VARCHAR(16)  NOT NULL DEFAULT 'select' COMMENT '值類型：select=下拉選擇, text=文本, number=數字',
    status          VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT 'enabled / disabled',
    sort            INT          NOT NULL DEFAULT 0 COMMENT '排序',
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_category_code (category_code, code),
    KEY idx_category_code (category_code),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='參數類型';

-- ── 2. 參數值 ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_param_value (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    param_type_code VARCHAR(64)  NOT NULL COMMENT '所屬參數類型編碼（關聯 biz_eam_param_type.code）',
    category_code   VARCHAR(64)  NOT NULL COMMENT '所屬分類編碼（冗餘，方便查詢）',
    value           VARCHAR(200) NOT NULL COMMENT '可選值（如 A18 Pro / 16GB / 256GB）',
    sort            INT          NOT NULL DEFAULT 0 COMMENT '排序',
    status          VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT 'enabled / disabled',
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    KEY idx_param_type_code (param_type_code),
    KEY idx_category_code (category_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='參數值';

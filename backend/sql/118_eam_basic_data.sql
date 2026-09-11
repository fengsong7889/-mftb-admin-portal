-- =====================================================================
-- 118_eam_basic_data.sql
-- 物資管理：基礎數據表結構（冪等）
--
-- 包含：
--   1. biz_eam_category  — 資產分類（樹形，含參數模板）
--   2. biz_eam_brand     — 品牌庫（分類 → 品牌）
--   3. biz_eam_model     — 產品型號庫（分類 + 品牌 → 型號）
--   4. biz_eam_location  — 倉庫 / 存放位置（樹形：倉庫/樓層/辦公室）
-- =====================================================================

-- ── 1. 資產分類 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_category (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    code            VARCHAR(64)  NOT NULL COMMENT '分類編碼（唯一，如 0101 / 010101）',
    name            VARCHAR(100) NOT NULL COMMENT '分類名稱',
    parent_id       BIGINT       NOT NULL DEFAULT 0 COMMENT '父級 ID，0 為頂級',
    status          VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT 'enabled / disabled',
    param_template  JSON         DEFAULT NULL COMMENT '該分類下資產需填寫的參數模板 JSON',
    sort            INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark          VARCHAR(500) DEFAULT '' COMMENT '備註',
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_code (code),
    KEY idx_parent_id (parent_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='資產分類';

-- ── 2. 品牌庫 ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_brand (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    category_code   VARCHAR(64)  NOT NULL COMMENT '所屬分類編碼',
    brand_zh        VARCHAR(100) NOT NULL COMMENT '品牌中文',
    brand_en        VARCHAR(100) DEFAULT '' COMMENT '品牌英文',
    brand_logo      VARCHAR(500) DEFAULT '' COMMENT '品牌 LOGO URL',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    KEY idx_category_code (category_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='品牌庫';

-- ── 3. 產品型號庫 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_model (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    category_code   VARCHAR(64)  NOT NULL COMMENT '所屬分類編碼',
    brand_id        BIGINT       NOT NULL DEFAULT 0 COMMENT '所屬品牌 ID',
    brand_zh        VARCHAR(100) DEFAULT '' COMMENT '品牌中文（冗餘）',
    brand_en        VARCHAR(100) DEFAULT '' COMMENT '品牌英文（冗餘）',
    brand_logo      VARCHAR(500) DEFAULT '' COMMENT '品牌 LOGO（冗餘）',
    model_no        VARCHAR(100) DEFAULT '' COMMENT '產品型號編碼',
    name            VARCHAR(200) NOT NULL COMMENT '產品名稱',
    unit            VARCHAR(32)  NOT NULL DEFAULT '台' COMMENT '計量單位',
    ref_price       DECIMAL(14,2) DEFAULT 0 COMMENT '參考單價（澳門元）',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    KEY idx_category_code (category_code),
    KEY idx_brand_id (brand_id),
    KEY idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='產品型號庫';

-- ── 4. 倉庫 / 存放位置 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_location (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    code            VARCHAR(64)  NOT NULL COMMENT '位置編碼（唯一）',
    name            VARCHAR(100) NOT NULL COMMENT '位置名稱',
    parent_id       BIGINT       NOT NULL DEFAULT 0 COMMENT '父級 ID，0 為頂級',
    type            VARCHAR(16)  NOT NULL DEFAULT 'warehouse' COMMENT 'warehouse / floor / room',
    sort            INT          NOT NULL DEFAULT 0 COMMENT '排序',
    address         VARCHAR(500) DEFAULT '' COMMENT '地址',
    remark          VARCHAR(500) DEFAULT '' COMMENT '備註',
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_code (code),
    KEY idx_parent_id (parent_id),
    KEY idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='倉庫 / 存放位置';

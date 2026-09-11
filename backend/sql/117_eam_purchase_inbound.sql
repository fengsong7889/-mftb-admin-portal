-- =====================================================================
-- 117_eam_purchase_inbound.sql
-- 物資管理：採購入庫全鏈路表結構（冪等）
--
-- 包含：
--   1. biz_eam_purchase_request  — 採購申請（OA 審批關聯）
--   2. biz_eam_purchase_order    — 採購訂單（執行單）
--   3. biz_eam_purchase_order_item — 採購訂單明細
--   4. biz_eam_inbound_batch     — 驗收入庫批次
--   5. biz_eam_inbound_batch_item — 驗收入庫批次明細
--   6. biz_eam_asset             — 資產台賬
--   7. 編號生成規則種子數據
-- =====================================================================

-- ── 1. 採購申請 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_purchase_request (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    req_no          VARCHAR(32)  NOT NULL COMMENT '申請編號（CG+序號）',
    flow_no         VARCHAR(32)  DEFAULT NULL COMMENT '關聯 OA 流程編號',
    title           VARCHAR(200) NOT NULL COMMENT '申請標題',
    department      VARCHAR(100) NOT NULL DEFAULT '' COMMENT '申請部門',
    department_id   BIGINT       DEFAULT NULL COMMENT '申請部門 ID',
    applicant       VARCHAR(64)  NOT NULL COMMENT '申請人',
    applicant_emp_id VARCHAR(32) DEFAULT '' COMMENT '申請人工號',
    reason          VARCHAR(500) NOT NULL DEFAULT '' COMMENT '採購事由',
    budget          DECIMAL(14,2) DEFAULT 0 COMMENT '預算金額',
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',
    order_id        BIGINT       DEFAULT NULL COMMENT '審批通過後生成的採購訂單 ID',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_req_no (req_no),
    KEY idx_flow_no (flow_no),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='採購申請';

-- ── 2. 採購訂單 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_purchase_order (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    po_no           VARCHAR(32)  NOT NULL COMMENT '訂單編號（PO+序號）',
    req_id          BIGINT       DEFAULT 0 COMMENT '關聯採購申請 ID（0=直接下單）',
    supplier        VARCHAR(200) NOT NULL DEFAULT '' COMMENT '供應商（兼容舊數據）',
    amount          DECIMAL(14,2) DEFAULT 0 COMMENT '訂單金額（預估）',
    confirmed_amount DECIMAL(14,2) DEFAULT NULL COMMENT '實際成交金額',
    delivery_date   VARCHAR(32)  DEFAULT '' COMMENT '預計交貨日期',
    purchaser       VARCHAR(64)  DEFAULT '' COMMENT '採購經辦人',
    department      VARCHAR(100) DEFAULT '' COMMENT '服務部門（持久化）',
    remark          VARCHAR(500) DEFAULT '' COMMENT '採購事由/備註',
    tracking_no     VARCHAR(64)  DEFAULT '' COMMENT '快遞單號（兼容舊數據）',
    contact         VARCHAR(64)  DEFAULT '' COMMENT '供應商聯絡人（兼容舊數據）',
    order_date      VARCHAR(32)  DEFAULT '' COMMENT '下單日期（兼容舊數據）',
    exec_status     VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/purchasing/completed',
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '驗收狀態：pending/partial/received',
    accepted_qty    INT          DEFAULT 0 COMMENT '已驗收總數',
    return_qty      INT          DEFAULT 0 COMMENT '退貨總數',
    exchange_qty    INT          DEFAULT 0 COMMENT '換貨總數',
    concession_qty  INT          DEFAULT 0 COMMENT '讓步接收總數',
    supplier_groups JSON         DEFAULT NULL COMMENT '供應商分組 JSON',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_po_no (po_no),
    KEY idx_req_id (req_id),
    KEY idx_exec_status (exec_status),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='採購訂單';

-- ── 3. 採購訂單明細 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_purchase_order_item (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT       NOT NULL COMMENT '所屬訂單 ID',
    group_id        VARCHAR(64)  DEFAULT '' COMMENT '所屬供應商分組 ID',
    model_id        BIGINT       DEFAULT NULL COMMENT '資產型號 ID',
    model_name      VARCHAR(200) DEFAULT '' COMMENT '資產名稱',
    category_id     BIGINT       DEFAULT NULL COMMENT '分類 ID',
    category_name   VARCHAR(100) DEFAULT '' COMMENT '分類名稱',
    category_code   VARCHAR(64)  DEFAULT '' COMMENT '分類編碼',
    brand_id        BIGINT       DEFAULT NULL COMMENT '品牌 ID',
    brand_name      VARCHAR(100) DEFAULT '' COMMENT '品牌名稱',
    params          JSON         DEFAULT NULL COMMENT '參數信息 JSON',
    purchase_type   VARCHAR(16)  DEFAULT 'purchase' COMMENT 'purchase/lease',
    qty             INT          NOT NULL DEFAULT 1 COMMENT '數量',
    price           DECIMAL(14,2) DEFAULT 0 COMMENT '參考單價',
    confirmed_price DECIMAL(14,2) DEFAULT NULL COMMENT '成交單價',
    received_qty    INT          NOT NULL DEFAULT 0 COMMENT '已驗收數量',
    sort_order      INT          DEFAULT 0,
    KEY idx_order_id (order_id),
    KEY idx_group_id (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='採購訂單明細';

-- ── 4. 驗收入庫批次 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_inbound_batch (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_no        VARCHAR(32)  NOT NULL COMMENT '批次編號',
    po_id           BIGINT       NOT NULL COMMENT '關聯採購訂單 ID',
    po_no           VARCHAR(32)  NOT NULL COMMENT '採購訂單號（冗餘）',
    inbound_date    VARCHAR(32)  NOT NULL COMMENT '驗收日期',
    operator        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人',
    total_qty       INT          NOT NULL DEFAULT 0 COMMENT '入庫總數',
    accepted_qty    INT          NOT NULL DEFAULT 0 COMMENT '已驗收數量',
    pending_qty     INT          NOT NULL DEFAULT 0 COMMENT '未驗收數量',
    return_qty      INT          DEFAULT 0 COMMENT '退貨數量',
    exchange_qty    INT          DEFAULT 0 COMMENT '換貨數量',
    concession_qty  INT          DEFAULT 0 COMMENT '讓步接收數量',
    purchase_reason VARCHAR(500) DEFAULT '' COMMENT '採購事由（冗餘）',
    remark          VARCHAR(500) DEFAULT '' COMMENT '備註',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_batch_no (batch_no),
    KEY idx_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='驗收入庫批次';

-- ── 5. 驗收入庫批次明細 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_inbound_batch_item (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id        BIGINT       NOT NULL COMMENT '所屬批次 ID',
    model_id        BIGINT       NOT NULL COMMENT '資產型號 ID',
    model_name      VARCHAR(200) DEFAULT '' COMMENT '資產名稱',
    qty             INT          NOT NULL DEFAULT 1 COMMENT '驗收數量',
    location_id     BIGINT       DEFAULT NULL COMMENT '存放位置 ID',
    asset_nos       JSON         DEFAULT NULL COMMENT '生成的資產編號列表 JSON',
    sort_order      INT          DEFAULT 0,
    KEY idx_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='驗收入庫批次明細';

-- ── 6. 資產台賬 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_asset (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_no        VARCHAR(64)  NOT NULL COMMENT '資產編號（系統生成，唯一）',
    asset_name      VARCHAR(200) NOT NULL DEFAULT '' COMMENT '資產名稱',
    asset_type      VARCHAR(100) DEFAULT '' COMMENT '資產分類名稱',
    category_id     BIGINT       DEFAULT NULL COMMENT '分類 ID',
    category_code   VARCHAR(64)  DEFAULT '' COMMENT '分類編碼',
    brand           VARCHAR(100) DEFAULT '' COMMENT '品牌',
    brand_id        BIGINT       DEFAULT NULL COMMENT '品牌 ID',
    model_id        BIGINT       DEFAULT NULL COMMENT '型號 ID',
    params          JSON         DEFAULT NULL COMMENT '參數信息 JSON',
    unit            VARCHAR(32)  DEFAULT '' COMMENT '單位',
    purchase_value  DECIMAL(14,2) DEFAULT 0 COMMENT '購買價值',
    purchase_date   VARCHAR(32)  DEFAULT NULL COMMENT '購買日期',
    purchase_type   VARCHAR(16)  DEFAULT 'purchase' COMMENT 'purchase/lease',
    source          VARCHAR(16)  NOT NULL DEFAULT 'self' COMMENT 'self/lease',
    company         VARCHAR(200) DEFAULT '' COMMENT '所屬公司',
    location        VARCHAR(200) DEFAULT '' COMMENT '存放地點名稱',
    location_id     BIGINT       DEFAULT NULL COMMENT '存放位置 ID',
    department      VARCHAR(100) DEFAULT '' COMMENT '歸屬部門',
    user_name       VARCHAR(64)  DEFAULT '' COMMENT '使用人',
    status          VARCHAR(16)  NOT NULL DEFAULT 'idle' COMMENT 'idle/in_use/in_repair/scrapped',
    hold_type       VARCHAR(16)  DEFAULT 'owned' COMMENT 'owned/borrowed',
    order_id        BIGINT       DEFAULT NULL COMMENT '關聯採購訂單 ID',
    batch_id        BIGINT       DEFAULT NULL COMMENT '關聯入庫批次 ID',
    remark          VARCHAR(500) DEFAULT '' COMMENT '備註',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_asset_no (asset_no),
    KEY idx_status (status),
    KEY idx_category (category_id),
    KEY idx_order_id (order_id),
    KEY idx_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='資產台賬';

-- ── 7. 編號生成規則種子數據 ─────────────────────────────────────────
-- 注意: eam_purchase_request (CG) 規則由 BizSeqRuleInitializer v4 自動寫入
-- 以下僅補充 PO/IB/FA 三條規則（手動建庫時使用，Java 初始化器也會幂等寫入）

INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('eam_purchase_order', '採購訂單編號', '物資管理', 'PO', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('eam_inbound_batch', '驗收入庫批次編號', '物資管理', 'IB', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('eam_asset', '資產編號', '物資管理', 'FA', 'YYYYMMDD', 6, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

-- ── 8. 流程配置表新增配置ID列 ──────────────────────────────────────────
-- 注意: workflow_config (LC) 規則由 BizSeqRuleInitializer v5 自動寫入
ALTER TABLE biz_workflow_config ADD COLUMN IF NOT EXISTS config_id VARCHAR(32) NULL COMMENT '配置ID（LC+5位自增序號）' AFTER id;

INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('workflow_config', '流程配置ID', '審批中心', 'LC', '', 5, 1, 1, '{prefix} + {n}位自增序號（全局自增）');

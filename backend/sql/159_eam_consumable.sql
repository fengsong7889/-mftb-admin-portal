-- =====================================================================
-- 159_eam_consumable.sql
-- 耗材管理（消耗品/MRO）一期建表 + 菜單 + 編號規則（冪等，可在 SQLPub 在線執行）
--
-- 設計要點（與資產域「單件化台賬」分離，耗材按「數量型庫存」管理）：
--   1. biz_eam_consumable_item        — 耗材主數據（SKU 級，含安全庫存/限領量）
--   2. biz_eam_consumable_stock       — 庫存表（耗材 × 倉庫 唯一，含審批佔用 locked_qty）
--   3. biz_eam_consumable_txn         — 出入庫流水（append-only，審計與統計數據源）
--   4. biz_eam_consumable_claim       — 領用單（申請 → 審批 → 出庫核銷，無歸還流程）
--   5. biz_eam_consumable_claim_item  — 領用單明細
--   6. 菜單：物資管理下新增「耗材管理」分組 + 5 個子菜單
--   7. 編號規則：耗材編碼 (HC) / 耗材領用單號 (HCLY)
--
-- 注意: 應用啟動時 ConsumableSchemaInitializer 會以相同結構冪等建表/種菜單，
--       本文件供手動建庫與 SQLPub 平台執行使用。
-- =====================================================================

-- ── 1. 耗材主數據 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_consumable_item (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    item_code       VARCHAR(32)  NOT NULL COMMENT '耗材編碼（HC+6位全局自增）',
    name            VARCHAR(128) NOT NULL COMMENT '耗材名稱',
    category_id     BIGINT       DEFAULT NULL COMMENT '分類 ID（biz_eam_category）',
    category_code   VARCHAR(64)  DEFAULT '' COMMENT '分類編碼快照',
    category_name   VARCHAR(100) DEFAULT '' COMMENT '分類名稱快照',
    brand           VARCHAR(100) DEFAULT '' COMMENT '品牌',
    spec            VARCHAR(200) DEFAULT '' COMMENT '規格型號',
    unit            VARCHAR(32)  NOT NULL DEFAULT '個' COMMENT '計量單位（個/盒/包/箱/支）',
    ref_price       DECIMAL(14,2) DEFAULT 0 COMMENT '參考單價',
    image           TEXT         DEFAULT NULL COMMENT '圖片（Data URL）',
    safety_stock    INT          NOT NULL DEFAULT 0 COMMENT '安全庫存下限（0=不預警）',
    max_stock       INT          NOT NULL DEFAULT 0 COMMENT '庫存上限（0=不限）',
    per_claim_limit INT          NOT NULL DEFAULT 0 COMMENT '單人單次限領量（0=不限）',
    status          VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
    remark          VARCHAR(500) DEFAULT '' COMMENT '備註',
    created_by      VARCHAR(64)  DEFAULT '' COMMENT '創建人',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_item_code (item_code),
    KEY idx_status (status),
    KEY idx_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材主數據';

-- ── 2. 耗材庫存（耗材 × 倉庫 唯一） ──────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_consumable_stock (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    item_id      BIGINT   NOT NULL COMMENT '耗材 ID',
    location_id  BIGINT   NOT NULL DEFAULT 0 COMMENT '倉庫 ID（biz_eam_location）',
    location_name VARCHAR(200) DEFAULT '' COMMENT '倉庫名稱快照',
    qty          INT      NOT NULL DEFAULT 0 COMMENT '當前庫存數量',
    locked_qty   INT      NOT NULL DEFAULT 0 COMMENT '審批中佔用數量',
    version      BIGINT   NOT NULL DEFAULT 0 COMMENT '樂觀鎖版本（DB 端遞增）',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_location (item_id, location_id),
    KEY idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材庫存表';

-- ── 3. 出入庫流水（append-only） ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_consumable_txn (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    txn_no       VARCHAR(40)  NOT NULL COMMENT '流水號（CK+yyyyMMddHHmmss+隨機）',
    item_id      BIGINT       NOT NULL COMMENT '耗材 ID',
    item_code    VARCHAR(32)  DEFAULT '' COMMENT '耗材編碼快照',
    item_name    VARCHAR(128) DEFAULT '' COMMENT '耗材名稱快照',
    location_id  BIGINT       NOT NULL DEFAULT 0 COMMENT '倉庫 ID',
    location_name VARCHAR(200) DEFAULT '' COMMENT '倉庫名稱快照',
    txn_type     VARCHAR(20)  NOT NULL COMMENT '類型：in_purchase/in_manual/in_adjust/out_claim/out_adjust',
    qty          INT          NOT NULL COMMENT '變動數量（入庫正/出庫負）',
    before_qty   INT          NOT NULL DEFAULT 0 COMMENT '變動前庫存',
    after_qty    INT          NOT NULL DEFAULT 0 COMMENT '變動後庫存',
    unit_cost    DECIMAL(14,2) DEFAULT NULL COMMENT '入庫單價（成本核算）',
    ref_type     VARCHAR(20)  DEFAULT '' COMMENT '關聯單據類型：claim/adjust',
    ref_id       BIGINT       DEFAULT NULL COMMENT '關聯單據 ID',
    operator_id  BIGINT       DEFAULT NULL COMMENT '操作人 ID',
    operator     VARCHAR(64)  DEFAULT '' COMMENT '操作人姓名',
    remark       VARCHAR(500) DEFAULT '' COMMENT '備註',
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    KEY idx_item (item_id),
    KEY idx_type (txn_type),
    KEY idx_created (created_at),
    KEY idx_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材出入庫流水';

-- ── 4. 領用單 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_consumable_claim (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    claim_no          VARCHAR(32)  NOT NULL COMMENT '領用單號（HCLY+YYYYMMDD+4位）',
    applicant_id      BIGINT       NOT NULL COMMENT '申請人 ID（sys_user.id）',
    applicant_name    VARCHAR(64)  NOT NULL COMMENT '申請人姓名快照',
    applicant_emp_id  VARCHAR(32)  DEFAULT '' COMMENT '申請人工號',
    department        VARCHAR(100) DEFAULT '' COMMENT '申請部門',
    reason            VARCHAR(500) NOT NULL DEFAULT '' COMMENT '領用事由',
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/issued/cancelled',
    approver_id       BIGINT       DEFAULT NULL COMMENT '審批人 ID',
    approver_name     VARCHAR(64)  DEFAULT '' COMMENT '審批人姓名',
    approved_at       DATETIME     DEFAULT NULL COMMENT '審批時間',
    approve_remark    VARCHAR(500) DEFAULT '' COMMENT '審批意見',
    issue_operator_id BIGINT       DEFAULT NULL COMMENT '出庫操作人 ID',
    issue_operator    VARCHAR(64)  DEFAULT '' COMMENT '出庫操作人姓名',
    issued_at         DATETIME     DEFAULT NULL COMMENT '出庫時間',
    cancel_reason     VARCHAR(500) DEFAULT '' COMMENT '取消原因',
    created_by        VARCHAR(64)  DEFAULT '' COMMENT '創建人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  DEFAULT '' COMMENT '最後更新人',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_claim_no (claim_no),
    KEY idx_applicant (applicant_id),
    KEY idx_status (status),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材領用單';

-- ── 5. 領用單明細 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_eam_consumable_claim_item (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵',
    claim_id      BIGINT        NOT NULL COMMENT '領用單 ID',
    item_id       BIGINT        NOT NULL COMMENT '耗材 ID',
    item_code     VARCHAR(32)   DEFAULT '' COMMENT '耗材編碼快照',
    item_name     VARCHAR(128)  NOT NULL COMMENT '耗材名稱快照',
    spec          VARCHAR(200)  DEFAULT '' COMMENT '規格型號快照',
    unit          VARCHAR(32)   DEFAULT '' COMMENT '單位快照',
    qty           INT           NOT NULL COMMENT '領用數量',
    location_id   BIGINT        NOT NULL DEFAULT 0 COMMENT '出庫倉庫 ID',
    location_name VARCHAR(200)  DEFAULT '' COMMENT '出庫倉庫名稱快照',
    unit_cost     DECIMAL(14,2) DEFAULT NULL COMMENT '出庫成本單價快照（取參考價）',
    KEY idx_claim (claim_id),
    KEY idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材領用單明細';

-- ── 6. 菜單：耗材管理分組 + 5 個子菜單 ───────────────────────────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-ops', '耗材管理', 2, 6, 'GoldOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-dashboard', '耗材看板', '/consumable-dashboard', 'ConsumableDashboard', 2, 1, 'DashboardOutlined',
       '["view"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-dashboard' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-item', '耗材檔案', '/consumable-item', 'ConsumableItem', 2, 2, 'ProfileOutlined',
       '["view","create","edit","delete"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-item' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-claim', '耗材領用', '/consumable-claim', 'ConsumableClaim', 2, 3, 'UserAddOutlined',
       '["view","create","edit","delete"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-claim' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-stock', '耗材庫存', '/consumable-stock', 'ConsumableStock', 2, 4, 'DatabaseOutlined',
       '["view","create","edit"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-stock' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-alert', '庫存預警', '/consumable-alert', 'ConsumableAlert', 2, 5, 'AlertOutlined',
       '["view","edit"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-alert' AND deleted = 0);

-- admin 角色授權（含分組）
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.code = 'admin'
  AND m.menu_key IN ('consumable-ops','consumable-dashboard','consumable-item','consumable-claim','consumable-stock','consumable-alert')
  AND m.deleted = 0;

-- ── 7. 編號規則種子 ──────────────────────────────────────────────────
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('eam_consumable_item', '耗材編碼', '物資管理(EAM)-耗材檔案', 'HC', '', 6, 1, 1, '{prefix} + {n}位數字自增（全局自增，如 HC000001）');

INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('eam_consumable_claim', '耗材領用單號', '物資管理(EAM)-耗材領用', 'HCLY', 'YYYYMMDD', 4, 0, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

-- ── 8. 驗證 ─────────────────────────────────────────────────────────
SELECT p.menu_key AS group_key, c.menu_key, c.name, c.sort_order
FROM sys_menu c JOIN sys_menu p ON c.parent_id = p.id
WHERE p.menu_key = 'consumable-ops' AND c.deleted = 0
ORDER BY c.sort_order;

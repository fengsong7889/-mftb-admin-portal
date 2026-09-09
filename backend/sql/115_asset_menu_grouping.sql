-- =====================================================================
-- 115_asset_menu_grouping.sql
-- 物資管理菜單分組重構（冪等，可在 SQLPub 平台在線執行）
--
-- 背景:
--   物資管理下有 18 個平鋪的二級菜單，數量過多，不易快速定位。
--   現按資產生命周期分為 4 個三級分組 + 1 個直達二級菜單展示。
--
-- 最終結構:
--   物資管理
--   ├── 資產看板（二級直達）
--   ├── 採購入庫  → 驗收入庫
--   ├── 資產流轉  → 資產台賬、領用、借用、歸還、調撥、交接
--   ├── 維護與處置 → 維修、損壞賠付、報廢、盤點、變更歷史
--   └── 基礎設置  → 資產分類、資產型號、倉庫維護
-- =====================================================================

-- ── 1. 新增 4 個分組菜單（二級，掛在物資管理下）──────────────────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'asset-purchase', '採購入庫', 2, 2, 'ShoppingCartOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'asset-purchase' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'asset-flow-ops', '資產流轉', 2, 3, 'SwapOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'asset-maintenance', '維護與處置', 2, 4, 'ToolOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'asset-maintenance' AND deleted = 0);

INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'asset-basic', '基礎設置', 2, 5, 'SettingOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'asset-basic' AND deleted = 0);

-- ── 2. 資產看板改為二級直達（parent 指向 asset-management，sort=1）──
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-management') t), sort_order = 1
WHERE menu_key = 'asset-dashboard' AND deleted = 0;

-- ── 3. 將現有子菜單的 parent_id 改指向對應分組 ──────────────────────
-- 採購入庫組
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-purchase') t), sort_order = 1
WHERE menu_key = 'purchase-order' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-purchase') t), sort_order = 2
WHERE menu_key = 'asset-inbound' AND deleted = 0;

-- 資產流轉組
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 1
WHERE menu_key = 'asset-list' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 2
WHERE menu_key = 'asset-claim' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 3
WHERE menu_key = 'asset-borrow' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 4
WHERE menu_key = 'asset-return' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 5
WHERE menu_key = 'asset-transfer-list' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 6
WHERE menu_key = 'asset-handover' AND deleted = 0;

-- 維護與處置組
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-maintenance') t), sort_order = 1
WHERE menu_key = 'asset-repair' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-maintenance') t), sort_order = 2
WHERE menu_key = 'asset-compensation' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-maintenance') t), sort_order = 3
WHERE menu_key = 'asset-scrap' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-maintenance') t), sort_order = 4
WHERE menu_key = 'asset-inventory' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-maintenance') t), sort_order = 5
WHERE menu_key = 'asset-flow' AND deleted = 0;

-- 基礎設置組
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-basic') t), sort_order = 1
WHERE menu_key = 'asset-category' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-basic') t), sort_order = 2
WHERE menu_key = 'asset-model' AND deleted = 0;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-basic') t), sort_order = 3
WHERE menu_key = 'asset-location' AND deleted = 0;

-- ── 4. 確保 admin 角色擁有新增分組菜單的權限 ─────────────────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.role_code = 'admin' AND m.menu_key IN ('asset-purchase','asset-flow-ops','asset-maintenance','asset-basic')
AND m.deleted = 0;

-- ── 5. 驗證結果 ─────────────────────────────────────────────────────
SELECT
    COALESCE(p.menu_key, 'asset-management') AS group_key,
    COALESCE(p.name, '物資管理') AS group_name,
    c.menu_key AS child_key, c.name AS child_name, c.sort_order AS child_sort
FROM sys_menu c
LEFT JOIN sys_menu p ON c.parent_id = p.id
WHERE c.menu_key IN ('asset-dashboard','asset-inbound','asset-list','asset-claim','asset-borrow',
    'asset-return','asset-transfer-list','asset-handover','asset-repair','asset-compensation',
    'asset-scrap','asset-inventory','asset-flow','asset-category','asset-model','asset-location')
AND c.deleted = 0
ORDER BY FIELD(COALESCE(p.menu_key,'asset-management'),
    'asset-management','asset-purchase','asset-flow-ops','asset-maintenance','asset-basic'),
    c.sort_order;

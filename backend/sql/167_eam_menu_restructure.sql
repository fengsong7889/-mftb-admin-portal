-- =====================================================================
-- 167_eam_menu_restructure.sql
-- 物資管理菜單結構重組（冪等，可在 SQLPub 平台在線執行）
--
-- 背景:
--   1. 一級菜單「資產管理(EAM)」名稱不準確，應為「物資管理」
--   2. asset-flow-ops 分組名「資產管理」與一級菜單同名，造成混淆
--   3. 維護與處置與資產流轉平級，但都是資產生命周期環節，應合併
--   4. 供應商僅服務資產採購，卻與業務分組平級
--   5. 耗材基礎配置（分類/品牌/計量單位）與業務操作混在一起
--   6. 基礎配置僅服務資產，名稱模糊
--
-- 重組後結構:
--   物資管理 (asset-management)
--   ├── 資產看板 (asset-dashboard)          — 二級直達
--   ├── 資產管理 (asset-flow-ops)           — 資產全生命周期（合併原流轉+維護處置）
--   │   ├── 資產台賬 / 領用 / 借用 / 歸還 / 調撥 / 交接
--   │   └── 維修 / 賠付 / 報廢 / 盤點 / 變更歷史
--   ├── 耗材管理 (consumable-ops)           — 耗材業務線（剝離基礎配置）
--   │   └── 看板 / 檔案 / 領用 / 庫存 / 流水 / 預警
--   ├── 採購與供應 (eam-procurement)         — 新建共享分組
--   │   └── 採購訂單 / 驗收入庫 / 供應商管理
--   └── 基礎數據 (eam-master-data)           — 統一基礎配置（改名+合併）
--       ├── 資產分類 / 品牌產品 / 倉庫 / 參數 / 標籤
--       └── 耗材分類 / 耗材品牌 / 計量單位
-- =====================================================================

-- ── 1. 一級菜單改名：資產管理(EAM) → 物資管理 ──────────────────────
UPDATE sys_menu
SET name = '物資管理', name_en = 'Material Management', icon = 'InboxOutlined'
WHERE menu_key = 'asset-management' AND deleted = 0;

-- ── 2. 新建「採購與供應」分組（二級，掛在物資管理下，sort=3）────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, icon, status, deleted)
SELECT p.id, 'eam-procurement', '採購與供應', 'Procurement & Supply', 2, 4, 'ShoppingCartOutlined', 1, 0
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0;

-- ── 3. 新建「基礎數據」分組（二級，掛在物資管理下，sort=4）──────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, icon, status, deleted)
SELECT p.id, 'eam-master-data', '基礎數據', 'Master Data', 2, 5, 'DatabaseOutlined', 1, 0
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0;

-- ── 4. 確保 admin 角色持有新分組權限 ────────────────────────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view"]'
FROM sys_role r, sys_menu m
WHERE r.code = 'admin'
  AND m.menu_key IN ('eam-procurement', 'eam-master-data')
  AND m.deleted = 0;

-- ── 5. asset-flow-ops 改名：資產管理 → 資產管理（保留，含義擴展）────
-- 原分組名與一級菜單衝突，現一級已改名為「物資管理」，衝突消除
-- 但為語義更清晰，改名為「資產運營」
UPDATE sys_menu
SET name = '資產運營', name_en = 'Asset Operations'
WHERE menu_key = 'asset-flow-ops' AND deleted = 0;

-- ── 6. 維護與處置 → 併入資產運營（parent_id 改指向 asset-flow-ops）──
-- sort_order 接在原有 6 個子菜單之後（原 1-6，新增從 7 開始）
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 7
WHERE menu_key = 'asset-repair' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 8
WHERE menu_key = 'asset-compensation' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 9
WHERE menu_key = 'asset-scrap' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 10
WHERE menu_key = 'asset-inventory' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops') t), sort_order = 11
WHERE menu_key = 'asset-flow' AND deleted = 0;

-- ── 7. 停用原「維護與處置」空分組 ──────────────────────────────────
UPDATE sys_menu SET deleted = 1, updated_by = 'system'
WHERE menu_key = 'asset-maintenance' AND deleted = 0;

-- ── 8. 採購入庫 → 採購訂單/驗收入庫 移入「採購與供應」──────────────
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-procurement') t), sort_order = 1
WHERE menu_key = 'purchase-order' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-procurement') t), sort_order = 2
WHERE menu_key = 'asset-inbound' AND deleted = 0;

-- ── 9. 供應商管理 → 移入「採購與供應」──────────────────────────────
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-procurement') t), sort_order = 3
WHERE menu_key = 'asset-supplier' AND deleted = 0;

-- ── 10. 停用原「採購入庫」空分組 ───────────────────────────────────
UPDATE sys_menu SET deleted = 1, updated_by = 'system'
WHERE menu_key = 'asset-purchase' AND deleted = 0;

-- ── 11. 基礎配置 → 改名為「基礎配置」並移入「基礎數據」─────────
-- 先改名避免與新分組混淆
UPDATE sys_menu SET name = '基礎配置', name_en = 'Basic Configuration'
WHERE menu_key = 'asset-basic' AND deleted = 0;

-- asset-basic 作為子分組移入基礎數據
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-master-data') t), sort_order = 1
WHERE menu_key = 'asset-basic' AND deleted = 0;

-- ── 12. 耗材基礎配置 → 從耗材管理移入「基礎數據」───────────────────
-- 耗材分類管理
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-master-data') t), sort_order = 2
WHERE menu_key = 'consumable-category' AND deleted = 0;

-- 耗材品牌管理
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-master-data') t), sort_order = 3
WHERE menu_key = 'consumable-brand' AND deleted = 0;

-- 計量單位管理
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-master-data') t), sort_order = 4
WHERE menu_key = 'consumable-unit' AND deleted = 0;

-- ── 13. 調整二級分組排序 ───────────────────────────────────────────
-- 最終排序：資產看板=1, 資產運營=2, 耗材管理=3, 採購與供應=4, 基礎數據=5
UPDATE sys_menu SET sort_order = 1 WHERE menu_key = 'asset-dashboard'   AND deleted = 0;
UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'asset-flow-ops'   AND deleted = 0;
UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'consumable-ops'   AND deleted = 0;
UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'eam-procurement'  AND deleted = 0;
UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'eam-master-data'  AND deleted = 0;

-- ── 14. 驗證最終結構 ───────────────────────────────────────────────
SELECT
    COALESCE(p2.menu_key, p1.menu_key, c.menu_key) AS L1,
    COALESCE(p2.name, p1.name, c.name) AS L1_name,
    CASE
        WHEN p2.menu_key IS NOT NULL THEN p2.menu_key
        WHEN p1.menu_key IS NOT NULL AND p1.menu_key != 'asset-management' THEN p1.menu_key
        ELSE '—'
    END AS L2,
    CASE
        WHEN p2.menu_key IS NOT NULL THEN p2.name
        WHEN p1.menu_key IS NOT NULL AND p1.menu_key != 'asset-management' THEN p1.name
        ELSE '—'
    END AS L2_name,
    c.menu_key AS child_key,
    c.name AS child_name,
    c.sort_order AS child_sort
FROM sys_menu c
LEFT JOIN sys_menu p1 ON c.parent_id = p1.id
LEFT JOIN sys_menu p2 ON p1.parent_id = p2.id
WHERE c.menu_key IN (
    'asset-dashboard',
    'asset-list','asset-claim','asset-borrow','asset-return','asset-transfer-list','asset-handover',
    'asset-repair','asset-compensation','asset-scrap','asset-inventory','asset-flow',
    'consumable-dashboard','consumable-item','consumable-claim','consumable-stock',
    'consumable-stock-txn','consumable-alert',
    'purchase-order','asset-inbound','asset-supplier',
    'asset-category','asset-model','asset-location','param-library','asset-tag',
    'consumable-category','consumable-brand','consumable-unit'
)
AND c.deleted = 0
ORDER BY FIELD(COALESCE(p2.menu_key, p1.menu_key, c.menu_key),
    'asset-management'),
    COALESCE(p2.sort_order, p1.sort_order, c.sort_order),
    p2.sort_order, p1.sort_order, c.sort_order;

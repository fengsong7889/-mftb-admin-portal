-- =====================================================================
-- 178_eam_menu_restructure_v2.sql
-- 物資管理菜單結構重組 v2（冪等，可在 SQLPub 平台在線執行）
--
-- 背景:
--   1. 「維護與處置」與「資產運營」平級，但維修/賠付/報廢/盤點/變更歷史
--      都是資產生命周期運營環節，應合併進「資產運營」
--   2. 供應商管理孤立為二級直達，業務上屬於採購鏈起點，應整合進採購分組
--   3. 「採購入庫」分組名稱狹隘，不含供應商，業務鏈不完整
--   4. 「基礎配置」名稱模糊，實際為主數據（Master Data），應改名
--   5. 耗材管理排序應緊跟資產看板，保持兩個業務線入口在頂層對稱
--
-- 重組後結構:
--   物資管理 (asset-management)
--   ├── 資產看板 (asset-dashboard)          — 二級直達, sort=1
--   ├── 耗材管理 (consumable-ops)           — 二級分組, sort=2
--   │   └── 看板 / 檔案 / 領用 / 庫存 / 流水 / 預警
--   ├── 資產運營 (asset-flow-ops)           — 二級分組, sort=3（合併原維護與處置）
--   │   ├── 台賬 / 領用 / 借用 / 歸還 / 調撥 / 交接
--   │   └── 維修 / 賠付 / 報廢 / 盤點 / 變更歷史
--   ├── 採購與供應 (eam-procurement)         — 二級分組, sort=4（新建）
--   │   └── 採購執行 / 驗收入庫 / 供應商管理
--   └── 基礎數據 (asset-basic)              — 二級分組, sort=5（改名）
--       └── 分類庫 / 品牌產品庫 / 倉庫管理 / 產品參數庫 / 資產標籤
-- =====================================================================

-- ── 1. 合併「維護與處置」→「資產運營」────────────────────────────────
-- 維修/賠付/報廢/盤點/變更歷史 的 parent_id 改指向 asset-flow-ops，
-- sort_order 接在原有 6 個子菜單之後（7~11）

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0) t), sort_order = 7
WHERE menu_key = 'asset-repair' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0) t), sort_order = 8
WHERE menu_key = 'asset-compensation' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0) t), sort_order = 9
WHERE menu_key = 'asset-scrap' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0) t), sort_order = 10
WHERE menu_key = 'asset-inventory' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0) t), sort_order = 11
WHERE menu_key = 'asset-flow' AND deleted = 0;

-- ── 2. 停用原「維護與處置」空分組 ──────────────────────────────────
UPDATE sys_menu SET deleted = 1, updated_by = 'system'
WHERE menu_key = 'asset-maintenance' AND deleted = 0;

-- ── 3. 新建「採購與供應」分組（二級，掛在物資管理下，sort=4）────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'eam-procurement', '採購與供應', 'Procurement & Supply', 2, 4, 'ShoppingCartOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-management' AND p.deleted = 0;

-- ── 4. 確保 admin 角色持有新分組權限 ────────────────────────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view"]'
FROM sys_role r, sys_menu m
WHERE r.code = 'admin'
  AND m.menu_key = 'eam-procurement'
  AND m.deleted = 0;

-- ── 5. 採購執行 / 驗收入庫 → 移入「採購與供應」──────────────────────
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-procurement' AND deleted = 0) t), sort_order = 1
WHERE menu_key = 'purchase-order' AND deleted = 0;

UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-procurement' AND deleted = 0) t), sort_order = 2
WHERE menu_key = 'asset-inbound' AND deleted = 0;

-- ── 6. 供應商管理 → 移入「採購與供應」──────────────────────────────
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-procurement' AND deleted = 0) t), sort_order = 3
WHERE menu_key = 'asset-supplier' AND deleted = 0;

-- ── 7. 停用原「採購入庫」空分組 ────────────────────────────────────
UPDATE sys_menu SET deleted = 1, updated_by = 'system'
WHERE menu_key = 'asset-purchase' AND deleted = 0;

-- ── 8. 「基礎配置」改名為「基礎數據」────────────────────────────────
UPDATE sys_menu
SET name = '基礎數據', name_en = 'Master Data'
WHERE menu_key = 'asset-basic' AND deleted = 0;

-- ── 9. 調整二級分組排序 ───────────────────────────────────────────
-- 最終排序：資產看板=1, 耗材管理=2, 資產運營=3, 採購與供應=4, 基礎數據=5
UPDATE sys_menu SET sort_order = 1 WHERE menu_key = 'asset-dashboard'   AND deleted = 0;
UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'consumable-ops'   AND deleted = 0;
UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'asset-flow-ops'   AND deleted = 0;
UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'eam-procurement'  AND deleted = 0;
UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'asset-basic'      AND deleted = 0;

-- ── 10. 資產運營子菜單名稱統一（動詞前置）─────────────────────────
UPDATE sys_menu SET name = '歸還資產', name_en = 'Return Asset'    WHERE menu_key = 'asset-return'        AND deleted = 0;
UPDATE sys_menu SET name = '調撥資產', name_en = 'Transfer Asset'  WHERE menu_key = 'asset-transfer-list' AND deleted = 0;
UPDATE sys_menu SET name = '交接資產', name_en = 'Handover Asset'  WHERE menu_key = 'asset-handover'      AND deleted = 0;
UPDATE sys_menu SET name = '報廢資產', name_en = 'Scrap Asset'     WHERE menu_key = 'asset-scrap'         AND deleted = 0;
UPDATE sys_menu SET name = '盤點資產', name_en = 'Inventory Asset' WHERE menu_key = 'asset-inventory'     AND deleted = 0;

-- ── 11. 驗證最終結構 ───────────────────────────────────────────────
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
    'asset-category','asset-model','asset-location','param-library','asset-tag'
)
AND c.deleted = 0
ORDER BY COALESCE(p2.sort_order, p1.sort_order, c.sort_order),
    p2.sort_order, p1.sort_order, c.sort_order;

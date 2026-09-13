-- =====================================================================
-- 126_asset_param_library_menu.sql
-- 修復 asset-param-library 菜單缺失問題
--
-- 背景:
--   後端啟動時報警：menuKey 'asset-param-library' 在 sys_menu 中不存在
--   導致非超管用戶無法訪問 EAM 參數庫相關接口
--
-- 解決方案:
--   1. 在 sys_menu 中插入 asset-param-library 菜單記錄（掛在 基礎設置 下）
--   2. 為 admin 角色分配該菜單權限
-- =====================================================================

-- ── 1. 新增參數庫菜單（三級，掛在 基礎設置 asset-basic 下）───────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, created_by, updated_by)
SELECT p.id, 'asset-param-library', '參數庫', 3, 4, 'DatabaseOutlined', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'asset-basic' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'asset-param-library' AND deleted = 0);

-- ── 2. 確保 admin 角色擁有該菜單權限 ────────────────────────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.role_code = 'admin' AND m.menu_key = 'asset-param-library'
AND m.deleted = 0;

-- ── 3. 驗證結果 ────────────────────────────────────────────────────
SELECT
    p.menu_key AS parent_key,
    p.name AS parent_name,
    c.menu_key AS child_key,
    c.name AS child_name,
    c.sort_order AS child_sort
FROM sys_menu c
LEFT JOIN sys_menu p ON c.parent_id = p.id
WHERE c.menu_key = 'asset-param-library'
AND c.deleted = 0;

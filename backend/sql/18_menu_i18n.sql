-- ============================================================
-- MFTB 搜广推系统 - 菜单多语言配置迁移
-- 为 sys_menu 增加 name_en 英文菜单名列 (中文名称沿用 name 列)
-- 首次启动时 DataInitializer 会自动完成等效迁移, 本脚本供手动执行参考
-- 英文名种子数据来源于前端 src/i18n/menuNameEn.ts 的 MENU_NAME_EN 映射
-- ============================================================

-- 1. 补充 name_en 列 (兼容旧结构)
SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_menu ADD COLUMN name_en VARCHAR(100) NULL COMMENT ''菜单英文名称'' AFTER name',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND COLUMN_NAME = 'name_en');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 回填存量菜单的英文名称 (仅填充未配置的, 不覆盖人工修改)
UPDATE sys_menu SET name_en = 'Home'                    WHERE menu_key = 'home' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Merchant Group'          WHERE menu_key = 'merchant_group' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Group Management'        WHERE menu_key = 'merchant-group-list' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Store Management'        WHERE menu_key = 'store-list' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Merchant Promotion Tools' WHERE menu_key = 'merchant_promotion' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Dashboard'               WHERE menu_key = 'promotion-dashboard' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Algorithm Library'       WHERE menu_key = 'promotion-algorithm' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Feed Strategy'           WHERE menu_key = 'promotion-slot-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Sales Pricing'           WHERE menu_key = 'promotion-waterfall' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Gift Management'         WHERE menu_key = 'gift-manage' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Promotion Gifts'         WHERE menu_key = 'gift-detail' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Consumption Details'     WHERE menu_key = 'gift-consume-detail' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Ad Sales'                WHERE menu_key = 'ad-sales' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Word Library'            WHERE menu_key = 'promotion-word-library' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Promotion Pass'          WHERE menu_key = 'promotion-tool' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Promotion Pass'          WHERE menu_key = 'promotion_tool' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Store Promotion'         WHERE menu_key = 'promotion-sales-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Report Analysis'         WHERE menu_key = 'promotion-report-group' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Overview'                WHERE menu_key = 'promotion-report-overview' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Order Report'            WHERE menu_key = 'promotion-report-order' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Type Comparison'         WHERE menu_key = 'promotion-report-compare' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Search Management'       WHERE menu_key = 'search' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Search Config'           WHERE menu_key = 'search-config-new' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Global Config'           WHERE menu_key = 'global-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Dimension Strategy'      WHERE menu_key = 'channel-strategy' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Search Guide'            WHERE menu_key = 'search-guide' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hint Config'             WHERE menu_key = 'hint-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hot Search Config'       WHERE menu_key = 'hot-search-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Weight Control'          WHERE menu_key = 'search-weight-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Search Library'          WHERE menu_key = 'search-library' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Word Segmentation'       WHERE menu_key = 'word-segmentation' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Synonym Library'         WHERE menu_key = 'synonym-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hot Search Library'      WHERE menu_key = 'hot-search-library' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Stop Words'              WHERE menu_key = 'stop-words' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Verification'            WHERE menu_key = 'search-verify-group' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Search Verify'           WHERE menu_key = 'search-verify' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hint Verify'             WHERE menu_key = 'hint-verify' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hot Search Verify'       WHERE menu_key = 'hot-search-verify' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Reports'                 WHERE menu_key = 'report' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hint Report'             WHERE menu_key = 'hint-report' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Hot Search Report'       WHERE menu_key = 'hot-search-report' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Finance'                 WHERE menu_key = 'finance' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Promotion Funds'         WHERE menu_key = 'promotion' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Account Balance'         WHERE menu_key = 'account-balance' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Batch Query'             WHERE menu_key = 'batch-query' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Detail Query'            WHERE menu_key = 'detail-query' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Merchant Reconciliation' WHERE menu_key = 'merchant-reconcile' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Write-off Reconciliation' WHERE menu_key = 'writeoff-reconcile' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Debt Reconciliation'     WHERE menu_key = 'debt-reconcile' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Approval Management'     WHERE menu_key = 'approval' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Approval Center'         WHERE menu_key = 'approval-center' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Group HR'                WHERE menu_key = 'hr' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Employee Management'     WHERE menu_key = 'employee-management' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Organization'            WHERE menu_key = 'organization-management' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Position'                WHERE menu_key = 'position-management' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Employee Activity'       WHERE menu_key = 'login-log' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Permission Management'   WHERE menu_key = 'permission' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Role Management'         WHERE menu_key = 'role-management' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Function Authorization'  WHERE menu_key = 'function-permission' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Data Authorization'      WHERE menu_key = 'data-permission' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'System Config'           WHERE menu_key = 'system-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Menu Config'             WHERE menu_key = 'menu-config' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Order Management'        WHERE menu_key = 'merchant-order-manage' AND (name_en IS NULL OR name_en = '');
UPDATE sys_menu SET name_en = 'Order Management'        WHERE menu_key = 'promotion-order-manage' AND (name_en IS NULL OR name_en = '');

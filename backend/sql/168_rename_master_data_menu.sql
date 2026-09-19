-- =====================================================================
-- 168_rename_master_data_menu.sql
-- 基礎數據分組改名：資產基礎配置 → 基礎配置
-- =====================================================================

UPDATE sys_menu
SET name = '基礎配置', name_en = 'Basic Configuration'
WHERE menu_key = 'eam-master-data' AND deleted = 0;

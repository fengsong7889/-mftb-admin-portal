-- ============================================================
-- 80_rename_model_list_menu.sql
-- 「模型列表」菜单更名为「模型信息」
-- 背景：该页面展示模型的详细信息（参数、价格、状态等），
--       原名偏向列表动作描述，更名为「模型信息」更贴合页面定位。
-- ============================================================

UPDATE sys_menu SET name = '模型信息' WHERE menu_key = 'ai-model-list';

-- 验证
SELECT id, menu_key, name, parent_id FROM sys_menu WHERE menu_key = 'ai-model-list';

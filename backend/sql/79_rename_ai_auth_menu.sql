-- ============================================================
-- 79_rename_ai_auth_menu.sql
-- 「权限管理」菜单更名为「模型授权」
-- 背景：该菜单实际承载部门/员工的模型授权配置，原名易与
--       系统权限管理混淆；同步更新 DataInitializer 种子名称。
-- ============================================================

UPDATE sys_menu SET name = '模型授权' WHERE menu_key = 'ai-auth';

-- 验证
SELECT id, menu_key, name, parent_id FROM sys_menu WHERE menu_key = 'ai-auth';

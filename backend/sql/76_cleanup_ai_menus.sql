-- ============================================================
-- MFTB 搜广推系统 - AI 智能中心菜单清理脚本
-- 执行此脚本后重启后端，DataInitializer 会自动重建正确的菜单树
-- ============================================================

-- 1. 先删除所有与 AI 相关的旧菜单（包括占位菜单）
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');
DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');
DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- 2. 清空数据库（可选，如果希望保留其他数据请跳过此步骤）
-- TRUNCATE TABLE sys_menu;
-- INSERT INTO sys_menu (id, menu_key, name, parent_id, type, sort_order) VALUES 
--     (1, 'home', '首页', NULL, 1, 1),
--     (2, 'finance', '财务管理', NULL, 1, 6);
-- ... 这样太复杂，不如直接让 DataInitializer 重建

-- 3. 验证已删除的菜单数量
SELECT COUNT(*) as deleted_count FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- 4. 查看剩余菜单数量（应该减少）
SELECT COUNT(*) as remaining_menus FROM sys_menu;

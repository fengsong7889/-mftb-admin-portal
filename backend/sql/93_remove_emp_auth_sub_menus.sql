-- ============================================================
-- 93_remove_emp_auth_sub_menus.sql
-- 移除员工模型权控下多余的三级菜单项（按职位授权、角色授权）
-- 这两个是页面内的 Tab，不应作为独立菜单显示在侧边栏
-- 脚本幂等，可重复执行
-- ============================================================

-- 软删除 ai-pos-auth 和 ai-role-auth 菜单记录
UPDATE sys_menu
SET deleted = 1, status = 2
WHERE menu_key IN ('ai-pos-auth', 'ai-role-auth')
  AND deleted = 0;

-- 同时清理 admin 角色关联（避免残留）
DELETE FROM sys_role_menu
WHERE menu_id IN (
  SELECT id FROM sys_menu WHERE menu_key IN ('ai-pos-auth', 'ai-role-auth')
);

-- 验证：员工模型权控下应无子菜单
SELECT p.menu_key AS parent_key, p.name AS parent_name,
       c.menu_key AS child_key, c.name AS child_name
FROM sys_menu p
LEFT JOIN sys_menu c ON c.parent_id = p.id AND c.deleted = 0
WHERE p.menu_key = 'ai-emp-model-auth' AND p.deleted = 0
ORDER BY c.sort_order;

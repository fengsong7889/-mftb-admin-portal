-- ============================================================
-- 90_add_employee_position_role_auth_menus.sql
-- 在员工模型权控下新增两个二级菜单：按职位授权、角色授权
-- 脚本幂等，可重复执行
-- 执行后：重新登录或刷新浏览器即可看到新菜单
-- ============================================================

-- ------------------------------------------------------------
-- 1. 获取父菜单 (ai-emp-model-auth) ID
-- ------------------------------------------------------------
SET @emp_auth_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-emp-model-auth' AND deleted = 0 LIMIT 1);

-- ------------------------------------------------------------
-- 2. 插入/更新两个新子菜单（如果不存在）
--    注意：由于当前 Tab 通过 URL hash 路由实现，这里 path 字段暂用占位值
--    实际路由仍指向 /ai-emp-model-auth#position 和 /ai-emp-model-auth#role
-- ------------------------------------------------------------
INSERT INTO sys_menu (parent_id, menu_key, name, path, type, sort_order, status, deleted, icon)
VALUES (@emp_auth_id, 'ai-pos-auth', '按职位授权', '/ai-emp-model-auth#position', 2, 3, 1, 0, 'IdcardOutlined')
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted = 0,
  icon = VALUES(icon);

INSERT INTO sys_menu (parent_id, menu_key, name, path, type, sort_order, status, deleted, icon)
VALUES (@emp_auth_id, 'ai-role-auth', '角色授权', '/ai-emp-model-auth#role', 2, 4, 1, 0, 'UserOutlined')
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted = 0,
  icon = VALUES(icon);

-- ------------------------------------------------------------
-- 3. admin 角色关联补齐（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND r.deleted = 0
  AND m.menu_key IN ('ai-pos-auth', 'ai-role-auth')
  AND m.deleted = 0;

-- ------------------------------------------------------------
-- 4. 验证：输出员工模型权控的最新子菜单
-- ------------------------------------------------------------
SELECT p.menu_key AS parent_key, p.name AS parent_name,
       c.menu_key AS child_key, c.name AS child_name, c.sort_order, c.path
FROM sys_menu p
LEFT JOIN sys_menu c ON c.parent_id = p.id AND c.deleted = 0
WHERE p.menu_key = 'ai-emp-model-auth' AND p.deleted = 0
ORDER BY c.sort_order;

-- ============================================================
-- 107_process_center_menu.sql
-- OA中心新增「流程中心」二级菜单
-- ============================================================

-- 1. 插入 process-center 菜单（挂在 oa-center 下）
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT
  p.id,
  'process-center',
  '流程中心',
  '/process-center',
  'ProcessCenter',
  'AppstoreOutlined',
  2,
  2,
  '["view"]',
  1,
  'system',
  0
FROM sys_menu p
WHERE p.menu_key = 'oa-center' AND p.deleted = 0
LIMIT 1
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  path = VALUES(path),
  icon = VALUES(icon),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted = 0;

-- 2. 补 admin 角色的菜单权限
INSERT INTO sys_role_menu (role_id, menu_id, actions)
SELECT
  r.id,
  m.id,
  '["view"]'
FROM sys_role r
CROSS JOIN sys_menu m
WHERE r.role_key = 'admin' AND r.deleted = 0
  AND m.menu_key = 'process-center' AND m.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id
  );

-- 验证
SELECT p.menu_key AS parent_key, c.menu_key, c.name, c.path, c.icon, c.sort_order
FROM sys_menu c
LEFT JOIN sys_menu p ON c.parent_id = p.id
WHERE c.menu_key = 'process-center';

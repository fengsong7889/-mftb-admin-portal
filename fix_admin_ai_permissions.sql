-- ================================
-- 修复管理员角色的 AI 菜单授权
-- ================================

-- 1. 查询 admin 角色 ID
SELECT id, name FROM sys_role WHERE role_code = 'admin' LIMIT 1;

-- 2. 查询 admin 角色已有的 AI 菜单授权
SELECT rm.menu_id, m.menu_key, m.name 
FROM sys_role_menu rm
JOIN sys_menu m ON rm.menu_id = m.id
WHERE rm.role_id = (SELECT id FROM sys_role WHERE role_code = 'admin' LIMIT 1)
AND (m.menu_key LIKE '%ai%' OR m.parent_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%'));

-- 3. 查询所有 AI 相关菜单 ID
SELECT id, menu_key, name, parent_id 
FROM sys_menu 
WHERE menu_key LIKE '%ai%' OR parent_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');

-- 4. 给 admin 角色添加缺少的 AI 菜单权限（替换 XXXX 为实际的 admin 角色 ID）
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
VALUES (XXXX, -- 实际 admin 角色 ID
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-assistant'),
    '["view"]'
),
(XXXX,
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-models'),
    '["view"]'
),
(XXXX,
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-model-provider'),
    '["view","create","edit"]'
),
(XXXX,
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-model-list'),
    '["view","create","edit"]'
),
(XXXX,
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-auth-quota'),
    '["view"]'
),
(XXXX,
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-auth'),
    '["view","create","edit"]'
),
(XXXX,
    (SELECT id FROM sys_menu WHERE menu_key = 'ai-quota'),
    '["view","create","edit"]'
);

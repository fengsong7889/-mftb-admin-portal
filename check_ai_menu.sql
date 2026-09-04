-- 查询 AI 相关菜单的当前结构
SELECT 
    id,
    menu_key,
    name,
    parent_id,
    type,
    sort_order,
    path
FROM sys_menu 
WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant'
ORDER BY id;

-- 查看父菜单关联
SELECT 
    m.id,
    m.menu_key,
    m.name,
    m.parent_id,
    p.name as parent_name,
    p.menu_key as parent_key,
    m.type,
    m.sort_order
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key LIKE '%ai%' OR m.menu_key = 'ai-assistant' OR p.menu_key = 'ai-assistant'
ORDER BY p.sort_order, m.sort_order;

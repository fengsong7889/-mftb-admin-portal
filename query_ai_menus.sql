-- 查询当前 AI 相关菜单的结构
SELECT 
    id,
    menu_key,
    name,
    parent_id,
    type,
    sort_order
FROM sys_menu 
WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant'
ORDER BY parent_id, sort_order;

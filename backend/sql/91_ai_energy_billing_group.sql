-- ============================================================
-- 91_ai_energy_billing_group.sql
-- 智能中心 (AI) 新增二级目录「能耗與賬單」，
-- 将原直挂智能中心的「能耗統計」「能耗明細」降级为三级菜单
-- 版本：v2026.09.04
-- ============================================================

-- 1. 新增二级目录菜单：能耗與賬單（目录型，无页面）
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT
    p.id,
    'ai-energy-billing',
    '能耗與賬單',
    NULL,
    NULL,
    'ThunderboltOutlined',
    1,                          -- type=1 目录
    5,                          -- 排在工具註冊中心(4)之后
    '["view"]',
    1,
    'system',
    0
FROM sys_menu p
WHERE p.menu_key = 'ai-assistant'
  AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-energy-billing');

-- 2. 将「能耗統計」「能耗明細」的 parent_id 改为新目录
UPDATE sys_menu c
  JOIN sys_menu p ON (p.menu_key = 'ai-energy-billing')
SET c.parent_id  = p.id,
    c.sort_order = CASE c.menu_key
                       WHEN 'ai_usage_stats'   THEN 1
                       WHEN 'ai_energy_detail' THEN 2
                       ELSE c.sort_order
                   END
WHERE c.menu_key IN ('ai_usage_stats', 'ai_energy_detail');

-- 3. 验证新菜单结构
SELECT
    m.id,
    m.menu_key,
    m.name,
    m.parent_id,
    p.name AS parent_name,
    m.type,
    m.sort_order,
    m.path
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key IN ('ai-assistant','ai-energy-billing','ai_usage_stats','ai_energy_detail')
   OR p.menu_key = 'ai-energy-billing'
ORDER BY COALESCE(p.sort_order, 0), m.sort_order;

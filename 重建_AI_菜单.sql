-- MFTB - 强制重建 AI 智能中心菜单树（最终版）
-- 请直接复制粘贴到数据库管理工具中执行

-- 1. 删除所有与 AI 相关的旧菜单记录及其权限关联
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant');
DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant');
DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- 2. 重新创建新的 AI 智能中心菜单树
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) VALUES
(NULL, 'ai-assistant', '智能中心 (AI)', NULL, NULL, 'AiOutline', 1, 7, '["view"]', 1, 'system', 0),
(LAST_INSERT_ID(), 'ai-models', '模型管理', NULL, NULL, 'AiOutline', 2, 1, '["view"]', 1, 'system', 0),
(LAST_INSERT_ID(), 'ai-auth-quota', '授权与配额', NULL, NULL, 'SafetyCertificateOutlined', 2, 2, '["view"]', 1, 'system', 0),
((SELECT id FROM sys_menu WHERE menu_key = 'ai-models'), 'ai-model-provider', '供应商管理', '/ai-model-providers', 'AiModelProvider', 'CloudServerOutlined', 2, 1, '["view","create","edit"]', 1, 'system', 0),
((SELECT id FROM sys_menu WHERE menu_key = 'ai-models'), 'ai-model-list', '模型列表', '/ai-model-list', 'AiModelList', 'AppstoreOutlined', 2, 2, '["view"]', 1, 'system', 0),
((SELECT id FROM sys_menu WHERE menu_key = 'ai-auth-quota'), 'ai-auth', '权限管理', '/ai-auth', 'AiAuth', 'TeamOutlined', 2, 1, '["view","create","edit"]', 1, 'system', 0),
((SELECT id FROM sys_menu WHERE menu_key = 'ai-auth-quota'), 'ai-quota', '额度策略', '/ai-quota', 'AiQuota', 'DollarOutlined', 2, 2, '["view","create","edit"]', 1, 'system', 0),
(LAST_INSERT_ID(), 'ai_tool_registry', '工具注册中心', '/ai-tool-registry', 'AiToolRegistry', 'ToolOutlined', 2, 3, '["view"]', 1, 'system', 0),
(LAST_INSERT_ID(), 'ai_usage_stats', '能耗统计', '/ai-usage-stats', 'AiUsageStats', 'LineChartOutlined', 2, 4, '["view"]', 1, 'system', 0),
(LAST_INSERT_ID(), 'ai_energy_detail', '能耗明细', '/ai-energy-detail', 'AiEnergyDetail', 'BarChartOutlined', 2, 5, '["view"]', 1, 'system', 0);

-- 3. 验证新菜单结构
SELECT 
    m.id,
    m.menu_key,
    m.name,
    CASE WHEN m.parent_id IS NULL THEN '顶级' ELSE '子级' END as level,
    p.name as parent_name,
    m.type,
    m.sort_order,
    m.path
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key LIKE '%ai%' OR m.menu_key = 'ai-assistant'
ORDER BY m.sort_order, p.sort_order;

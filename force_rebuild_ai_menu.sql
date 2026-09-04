-- ============================================================
-- MFTB - 强制重建 AI 智能中心菜单树（手动执行）
-- 执行步骤：
-- 1. 在数据库管理工具中连接 MySQL
-- 2. 选择 mftb_admin 数据库
-- 3. 复制并执行以下所有 SQL
-- ============================================================

-- Step 1: 备份当前 AI 菜单结构（可选，用于回滚）
CREATE TABLE IF NOT EXISTS sys_menu_backup_20260902 AS 
SELECT * FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- Step 2: 删除所有与 AI 相关的旧菜单记录
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant');
DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant');
DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- Step 3: 重新创建 AI 菜单树（按照新的层级结构）
-- 先创建顶级菜单 ai-assistant
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
VALUES 
(NULL, 'ai-assistant', '智能中心 (AI)', NULL, NULL, 'AiOutline', 1, 7, '["view"]', 1, 'system', 0);

SET @ai_assistant_id = LAST_INSERT_ID();

-- 创建二级菜单：模型管理、授权与配额
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
VALUES 
(@ai_assistant_id, 'ai-models', '模型管理', NULL, NULL, 'AiOutline', 2, 1, '["view"]', 1, 'system', 0),
(@ai_assistant_id, 'ai-auth-quota', '授权与配额', NULL, NULL, 'SafetyCertificateOutlined', 2, 2, '["view"]', 1, 'system', 0);

SET @ai_models_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-models');
SET @ai_auth_quota_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-auth-quota');

-- 创建三级菜单
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
VALUES 
(@ai_models_id, 'ai-model-provider', '供应商管理', '/ai-model-providers', 'AiModelProvider', 'CloudServerOutlined', 2, 1, '["view","create","edit"]', 1, 'system', 0),
(@ai_models_id, 'ai-model-list', '模型列表', '/ai-model-list', 'AiModelList', 'AppstoreOutlined', 2, 2, '["view"]', 1, 'system', 0),
(@ai_auth_quota_id, 'ai-auth', '权限管理', '/ai-auth', 'AiAuth', 'TeamOutlined', 2, 1, '["view","create","edit"]', 1, 'system', 0),
(@ai_auth_quota_id, 'ai-quota', '额度策略', '/ai-quota', 'AiQuota', 'DollarOutlined', 2, 2, '["view","create","edit"]', 1, 'system', 0),
(@ai_assistant_id, 'ai_tool_registry', '工具注册中心', '/ai-tool-registry', 'AiToolRegistry', 'ToolOutlined', 2, 3, '["view"]', 1, 'system', 0),
(@ai_assistant_id, 'ai_usage_stats', '能耗统计', '/ai-usage-stats', 'AiUsageStats', 'LineChartOutlined', 2, 4, '["view"]', 1, 'system', 0),
(@ai_assistant_id, 'ai_energy_detail', '能耗明细', '/ai-energy-detail', 'AiEnergyDetail', 'BarChartOutlined', 2, 5, '["view"]', 1, 'system', 0);

-- Step 4: 验证新菜单结构
SELECT 
    m.id,
    m.menu_key,
    m.name,
    m.parent_id,
    p.name as parent_name,
    m.type,
    m.sort_order,
    m.path
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key LIKE '%ai%' OR m.menu_key = 'ai-assistant' OR p.menu_key = 'ai-assistant'
ORDER BY p.sort_order, m.sort_order;

-- Step 5: 查看菜单总数（应该比原来少几个，因为删除了重复的占位菜单）
SELECT COUNT(*) as total_ai_menus FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

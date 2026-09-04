-- ============================================================
-- MFTB 搜广推系统 - AI 智能中心菜单拆分迁移脚本（修复版）
-- 使用动态父菜单 ID，不依赖固定值
-- 版本：v2026.09.02-2
-- ============================================================

-- 1. 获取 AI 智能中心的 parent_id
SET @ai_assistant_parent_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-assistant' LIMIT 1);

-- 如果没有找到 ai-assistant，则查找任意一个二级菜单作为参考
IF @ai_assistant_parent_id IS NULL THEN
    SELECT '警告：未找到 ai-assistant 菜单，将在根目录下创建新菜单' AS message;
    SET @ai_assistant_parent_id = NULL;
END IF;

-- ── 模型管理（二级目录） ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 
    @ai_assistant_parent_id as parent_id,
    'ai-models', '模型管理', NULL, NULL, 'AiOutline', 1, 1, '["view"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-models');

-- ── 授权与配额（二级目录） ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 
    @ai_assistant_parent_id as parent_id,
    'ai-auth-quota', '授权与配额', NULL, NULL, 'SafetyCertificateOutlined', 1, 2, '["view"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-auth-quota');

-- 2. 获取新创建的二级菜单 ID
SET @ai_models_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-models' LIMIT 1);
SET @ai_auth_quota_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-auth-quota' LIMIT 1);

-- ── 供应商管理 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 
    @ai_models_id,
    'ai-model-provider', '供应商管理', '/ai-model-providers', 'AiModelProvider', 'CloudServerOutlined', 2, 1, '["view","create","edit"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-model-provider');

-- ── 模型列表 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 
    @ai_models_id,
    'ai-model-list', '模型列表', '/ai-model-list', 'AiModelList', 'AppstoreOutlined', 2, 2, '["view"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-model-list');

-- ── 权限管理 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 
    @ai_auth_quota_id,
    'ai-auth', '权限管理', '/ai-auth', 'AiAuth', 'TeamOutlined', 2, 1, '["view","create","edit"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-auth');

-- ── 额度策略 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 
    @ai_auth_quota_id,
    'ai-quota', '额度策略', '/ai-quota', 'AiQuota', 'DollarOutlined', 2, 2, '["view","create","edit"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-quota');

-- 3. 更新旧菜单的父 ID（降级为占位菜单，防止 403）
UPDATE sys_menu 
SET parent_id = COALESCE(@ai_models_id, @ai_assistant_parent_id), sort_order = 99
WHERE menu_key IN ('ai_model_hub', 'ai_quota_auth')
AND parent_id != COALESCE(@ai_models_id, @ai_assistant_parent_id);

-- 4. 重新排序其他 AI 相关菜单
UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'ai_tool_registry';
UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'ai_usage_stats';
UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'ai_energy_detail';

-- 5. 查看新菜单结构（调试用）
SELECT 
    m.id,
    m.menu_key,
    m.name,
    m.parent_id,
    p.name as parent_name,
    m.type,
    m.sort_order
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key LIKE '%ai%' OR p.menu_key = 'ai-assistant'
ORDER BY p.sort_order, m.sort_order;

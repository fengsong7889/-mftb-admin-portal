-- ============================================================
-- MFTB 搜广推系统 - AI 智能中心菜单拆分迁移脚本
-- 将 AiModelHub (模型接入) 和 AiQuotaAuth (授权与配额) 拆分为独立菜单
-- 版本：v2026.09.02
-- ============================================================

-- 1. 新增二级菜单（父菜单为 AI-assistant, id 假设是 80）
-- 注意：实际 parent_id 需要根据现有 sys_menu 查询调整

-- ── 模型管理（二级目录） ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 80, 'ai-models', '模型管理', NULL, NULL, 'AiOutline', 1, 1, '["view"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-models');

-- ── 供应商管理 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 81, 'ai-model-provider', '供应商管理', '/ai-model-providers', 'AiModelProvider', 'CloudServerOutlined', 2, 1, '["view","create","edit"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-model-provider');

-- ── 模型列表 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 81, 'ai-model-list', '模型列表', '/ai-model-list', 'AiModelList', 'AppstoreOutlined', 2, 2, '["view"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-model-list');

-- ── 授权与配额（二级目录） ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 80, 'ai-auth-quota', '授权与配额', NULL, NULL, 'SafetyCertificateOutlined', 1, 2, '["view"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-auth-quota');

-- ── 权限管理 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 82, 'ai-auth', '权限管理', '/ai-auth', 'AiAuth', 'TeamOutlined', 2, 1, '["view","create","edit"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-auth');

-- ── 额度策略 ──
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT 82, 'ai-quota', '额度策略', '/ai-quota', 'AiQuota', 'DollarOutlined', 2, 2, '["view","create","edit"]', 1, CURRENT_USER, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-quota');

-- 2. 更新旧菜单的父 ID（降级为占位菜单，防止 403）
UPDATE sys_menu SET parent_id = 80, sort_order = 99
WHERE menu_key IN ('ai_model_hub', 'ai_quota_auth')
AND parent_id != 80;

-- 3. 重新排序 ai_tool_registry 和 ai_usage_stats、ai_energy_detail
UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'ai_tool_registry';
UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'ai_usage_stats';
UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'ai_energy_detail';

-- 4. 查看新菜单结构（调试用）
-- SELECT menu_key, name, parent_id, sort_order, type FROM sys_menu WHERE menu_key LIKE '%ai%' ORDER BY parent_id, sort_order;

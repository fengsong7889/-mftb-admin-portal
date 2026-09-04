-- ============================================================
-- MFTB 搜广推系统 - AI 智能中心菜单完整重建脚本
-- 直接创建所有 AI 相关菜单
-- ============================================================

-- 1. 删除旧的 AI 菜单（如果存在）
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');
DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');
DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- 2. 创建顶级菜单：智能中心 (AI)
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (999, NULL, 'ai-assistant', '智能中心 (AI)', 1, 7, 1, 0);
SET @ai_assistant_id = LAST_INSERT_ID();

-- 3. 创建二级菜单
-- 3.1 模型管理
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1000, @ai_assistant_id, 'ai-models', '模型管理', 2, 1, 1, 0);
SET @ai_models_id = LAST_INSERT_ID();

-- 3.2 授权与配额
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1001, @ai_assistant_id, 'ai-auth-quota', '授权与配额', 2, 2, 1, 0);
SET @ai_auth_quota_id = LAST_INSERT_ID();

-- 3.3 工具注册中心
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1002, @ai_assistant_id, 'ai_tool_registry', '工具注册中心', 2, 3, 1, 0);

-- 3.4 能耗统计
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1003, @ai_assistant_id, 'ai_usage_stats', '能耗统计', 2, 4, 1, 0);

-- 3.5 能耗明细
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1004, @ai_assistant_id, 'ai_energy_detail', '能耗明细', 2, 5, 1, 0);

-- 4. 创建三级菜单（模型管理下属）
-- 4.1 供应商管理
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1005, @ai_models_id, 'ai-model-provider', '供应商管理', 2, 1, 1, 0);

-- 4.2 模型列表
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1006, @ai_models_id, 'ai-model-list', '模型列表', 2, 2, 1, 0);

-- 5. 创建四级菜单（授权与配额下属）
-- 5.1 权限管理
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1007, @ai_auth_quota_id, 'ai-auth', '权限管理', 2, 1, 1, 0);

-- 5.2 额度策略
INSERT INTO sys_menu (id, parent_id, menu_key, name, type, sort_order, status, deleted) 
VALUES (1008, @ai_auth_quota_id, 'ai-quota', '额度策略', 2, 2, 1, 0);

-- 6. 授予 admin 角色权限（可选）
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","create","edit","delete","export"]'
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND m.menu_key IN ('ai-assistant', 'ai-models', 'ai-model-provider', 'ai-model-list', 
                                           'ai-auth-quota', 'ai-auth', 'ai-quota', 'ai_tool_registry', 
                                           'ai_usage_stats', 'ai_energy_detail');

-- 7. 验证创建结果
SELECT m.id, m.menu_key, m.name, m.parent_id, p.name as parent_name
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key LIKE '%ai%' OR m.menu_key = 'ai-assistant'
ORDER BY m.id;

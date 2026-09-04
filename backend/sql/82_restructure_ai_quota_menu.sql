-- ============================================================
-- 82_restructure_ai_quota_menu.sql
-- 重构"授权与配额"菜单为独立子树：拆分部门/员工 + 新增路由策略配置
-- 新菜单结构：
--   AI 配额与策略管理 (ai-quota-config, ai-assistant 二级)
--     ├── 按部门配置模型 (ai-dept-model-auth) - Tab1 复用原 AiAuth.tsx
--     ├── 按员工/角色配置模型 (ai-emp-model-auth) - Tab2 复用原 AiAuth.tsx
--     ├── 额度策略 (ai-quota-policy) - 复用现有 AiQuota.tsx
--     ├── 模型路由策略 (ai-routing-strategy) - 新增：Auto/省钱优先/性能优先规则配置
--     └── 使用量统计 (ai-quota-overview) - 新增：Dashboard 概览
-- 根因：用户要求将"授权与配额"拆分为独立子菜单体系 + 扩展功能边界。
-- 本脚本幂等：删除旧 key、重建新 key + 路径图标 + 角色关联。
-- ============================================================

SET @ai_parent = (SELECT id FROM sys_menu WHERE menu_key = 'ai-assistant' AND deleted = 0 LIMIT 1);

-- 1) 删除旧菜单（如果存在）
DELETE FROM sys_menu WHERE menu_key IN ('ai-auth-quota', 'ai-auth', 'ai-quota');

-- 2) 插入新菜单节点
INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted) VALUES
(@ai_parent, 'ai-quota-config', 'AI 配额与策略管理', 1, 2, 1, 0),
(@ai_parent, 'ai-dept-model-auth', '按部门配置模型', 2, 1, 1, 0),
(@ai_parent, 'ai-emp-model-auth', '按员工/角色配置模型', 2, 2, 1, 0),
(@ai_parent, 'ai-quota-policy', '额度策略', 2, 3, 1, 0),
(@ai_parent, 'ai-routing-strategy', '模型路由策略', 2, 4, 1, 0),
(@ai_parent, 'ai-quota-overview', '使用量统计', 2, 5, 1, 0);

-- 3) 获取新父菜单 ID 并补全路径/图标
SET @qc_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-quota-config' AND deleted = 0 LIMIT 1);

UPDATE sys_menu SET 
    path = CONCAT('/ai-', menu_key),
    icon = CASE
        WHEN menu_key = 'ai-quota-config' THEN '<LayoutOutlined />'
        WHEN menu_key = 'ai-dept-model-auth' THEN '<DepartmentOutlined />'
        WHEN menu_key = 'ai-emp-model-auth' THEN '<UsergroupAddOutlined />'
        WHEN menu_key = 'ai-quota-policy' THEN '<DollarOutlined />'
        WHEN menu_key = 'ai-routing-strategy' THEN '<BranchOutlined />'
        WHEN menu_key = 'ai-quota-overview' THEN '<LineChartOutlined />'
    END
WHERE parent_id = @qc_id;

-- 4) 补 admin 角色的菜单关联
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND r.deleted = 0
  AND m.menu_key IN ('ai-quota-config', 'ai-dept-model-auth', 'ai-emp-model-auth', 
                      'ai-quota-policy', 'ai-routing-strategy', 'ai-quota-overview')
  AND m.deleted = 0;

-- 验证
SELECT id, menu_key, name, parent_id, type, status, deleted, path, icon
FROM sys_menu
WHERE menu_key IN ('ai-quota-config', 'ai-dept-model-auth', 'ai-emp-model-auth', 
                   'ai-quota-policy', 'ai-routing-strategy', 'ai-quota-overview');

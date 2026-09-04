-- ============================================================
-- 78_ai_menu_icon_path.sql
-- 智能中心 (AI) 菜单补充 icon 与 path 字段
-- 背景：77 号脚本手动重建 AI 菜单时未写入 icon/path，
--       导致「授权与配额」无图标、子菜单点击无法跳转页面。
-- 图标名称必须与前端 src/components/MenuIcon.tsx 注册表一致。
-- ============================================================

-- 目录级菜单：仅补图标（无页面，path 留空）
UPDATE sys_menu SET icon = 'RobotOutlined'              WHERE menu_key = 'ai-assistant';
UPDATE sys_menu SET icon = 'DesktopOutlined'            WHERE menu_key = 'ai-models';
UPDATE sys_menu SET icon = 'SafetyCertificateOutlined'  WHERE menu_key = 'ai-auth-quota';

-- 页面级菜单：补图标 + 路由路径（与 App.tsx 路由一一对应）
UPDATE sys_menu SET icon = 'CloudServerOutlined', path = '/ai-model-provider' WHERE menu_key = 'ai-model-provider';
UPDATE sys_menu SET icon = 'AppstoreOutlined',    path = '/ai-model-list'     WHERE menu_key = 'ai-model-list';
UPDATE sys_menu SET icon = 'BankOutlined',        path = '/ai-auth'           WHERE menu_key = 'ai-auth';
UPDATE sys_menu SET icon = 'DollarOutlined',      path = '/ai-quota'          WHERE menu_key = 'ai-quota';

-- 其余 AI 菜单图标对齐（已有页面，补图标保证后端字段优先渲染）
UPDATE sys_menu SET icon = 'ToolOutlined',      path = '/ai-tool-registry' WHERE menu_key = 'ai_tool_registry';
UPDATE sys_menu SET icon = 'LineChartOutlined', path = '/ai-usage-stats'   WHERE menu_key = 'ai_usage_stats';
UPDATE sys_menu SET icon = 'FileSearchOutlined', path = '/ai-energy-detail' WHERE menu_key = 'ai_energy_detail';

-- 验证：查看 AI 菜单树图标与路径
SELECT m.id, m.menu_key, m.name, m.icon, m.path, p.menu_key AS parent_key
FROM sys_menu m
LEFT JOIN sys_menu p ON m.parent_id = p.id
WHERE m.menu_key LIKE 'ai%' OR m.menu_key = 'ai-assistant'
ORDER BY m.parent_id, m.sort_order;

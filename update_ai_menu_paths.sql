-- 更新 AI 菜单的 path 字段
UPDATE sys_menu SET path = '/ai-model-providers', component = 'AiModelProvider' WHERE menu_key = 'ai-model-provider';
UPDATE sys_menu SET path = '/ai-model-list', component = 'AiModelList' WHERE menu_key = 'ai-model-list';
UPDATE sys_menu SET path = '/ai-auth', component = 'AiAuth' WHERE menu_key = 'ai-auth';
UPDATE sys_menu SET path = '/ai-quota', component = 'AiQuota' WHERE menu_key = 'ai-quota';

-- 验证
SELECT id, menu_key, name, path, component FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

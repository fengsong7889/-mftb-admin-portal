-- ============================================================
-- 275_ai_assistant_menu_split.sql（参考文档，实际执行体为 classpath 同名脚本）
-- 旧 ai-assistant-config 的角色/部门授权按动作迁移到新子菜单：
--   view → 8 个新菜单；edit → 配置类 5 个菜单；反馈/审计/概览只读。
-- 只执行一次，INSERT IGNORE，先搬授权再由 Java 侧软删旧菜单。
-- ============================================================

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT rm.role_id, m.id, '["view"]'
FROM sys_role_menu rm
JOIN sys_menu old ON old.id = rm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-overview', 'ai-assistant-capability', 'ai-assistant-profile',
  'ai-assistant-glossary', 'ai-assistant-knowledge', 'ai-assistant-guardrail',
  'ai-assistant-feedback', 'ai-assistant-audit')
WHERE JSON_VALID(rm.actions) AND JSON_CONTAINS(rm.actions, '"view"');

INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT dm.dept_id, m.id, '["view"]'
FROM sys_department_menu dm
JOIN sys_menu old ON old.id = dm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-overview', 'ai-assistant-capability', 'ai-assistant-profile',
  'ai-assistant-glossary', 'ai-assistant-knowledge', 'ai-assistant-guardrail',
  'ai-assistant-feedback', 'ai-assistant-audit')
WHERE JSON_VALID(dm.actions) AND JSON_CONTAINS(dm.actions, '"view"');

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT rm.role_id, m.id, '["view","edit"]'
FROM sys_role_menu rm
JOIN sys_menu old ON old.id = rm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
WHERE JSON_VALID(rm.actions) AND JSON_CONTAINS(rm.actions, '"edit"')
ON DUPLICATE KEY UPDATE actions = '["view","edit"]';

INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT dm.dept_id, m.id, '["view","edit"]'
FROM sys_department_menu dm
JOIN sys_menu old ON old.id = dm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
WHERE JSON_VALID(dm.actions) AND JSON_CONTAINS(dm.actions, '"edit"')
ON DUPLICATE KEY UPDATE actions = '["view","edit"]';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view"]'
FROM sys_role r
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-overview', 'ai-assistant-capability', 'ai-assistant-profile',
  'ai-assistant-glossary', 'ai-assistant-knowledge', 'ai-assistant-guardrail',
  'ai-assistant-feedback', 'ai-assistant-audit')
WHERE r.code = 'admin';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","edit"]'
FROM sys_role r
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
WHERE r.code = 'admin';

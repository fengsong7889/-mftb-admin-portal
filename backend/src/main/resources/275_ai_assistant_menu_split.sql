-- ============================================================
-- 275_ai_assistant_menu_split.sql
-- AI 助手配置中心拆分：旧 ai-assistant-config 的授权按动作搬到新子菜单。
-- 只执行一次（由 AiAssistantConfigMenuInitializer 的版本键控制）；
-- INSERT IGNORE 保证重复执行不覆盖/不复活已撤销的授权。
-- 旧菜单行在 Java 侧软删，本脚本只读取其授权关系。
-- ============================================================

-- 1) 旧 view 授权 → 新菜单全部可见（概览/能力/骨架/术语/知识库/护栏/反馈/审计）
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

-- 2) 旧 edit 授权 → 配置类 5 个菜单可编辑；反馈/审计/概览只读
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

-- 3) 超管兜底：所有新菜单可见，配置类可编辑
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

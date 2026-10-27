-- ============================================================
-- 279_ai_assistant_extra_menu_grants.sql
-- AI 助手配置中心补授权：快捷提問 / 推送模板 / 記憶策略。
--
-- 背景：275 的授权清单只覆盖 8 个菜单，这三个菜单在存量库（v2.1 已登记，
-- 不会重放 275）与全新建库上都没有任何授权行，连超管兜底也漏了。
--
-- 授权来源按三段取并集：
--   1) 旧 ai-assistant-config 的 view / edit 持有者（软删菜单的授权行仍在）
--   2) 已拆分完成的兄弟配置菜单持有者（旧菜单授权被种子清理时的兜底）
--   3) 内置 admin 角色兜底
-- 全部 INSERT IGNORE / ON DUPLICATE KEY UPDATE，可重放；
-- 只执行一次（由 AiAssistantConfigMenuInitializer 的 v2.2 版本键控制）。
-- ============================================================

-- 1) view：旧 ai-assistant-config 的 view 持有者
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT DISTINCT rm.role_id, m.id, '["view"]'
FROM sys_role_menu rm
JOIN sys_menu old ON old.id = rm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(rm.actions) AND JSON_CONTAINS(rm.actions, '"view"');

-- 2) view：兄弟配置菜单（能力/骨架/术语/知识库/护栏）持有者
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT DISTINCT rm.role_id, m.id, '["view"]'
FROM sys_role_menu rm
JOIN sys_menu sib ON sib.id = rm.menu_id AND sib.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(rm.actions) AND JSON_CONTAINS(rm.actions, '"view"');

-- 3) edit：两个来源的 edit 持有者提升为 view+edit
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT DISTINCT rm.role_id, m.id, '["view","edit"]'
FROM sys_role_menu rm
JOIN sys_menu old ON old.id = rm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(rm.actions) AND JSON_CONTAINS(rm.actions, '"edit"')
ON DUPLICATE KEY UPDATE actions = '["view","edit"]';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT DISTINCT rm.role_id, m.id, '["view","edit"]'
FROM sys_role_menu rm
JOIN sys_menu sib ON sib.id = rm.menu_id AND sib.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(rm.actions) AND JSON_CONTAINS(rm.actions, '"edit"')
ON DUPLICATE KEY UPDATE actions = '["view","edit"]';

-- 4) 超管兜底：先补 view，再提升为 view+edit
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view"]'
FROM sys_role r
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE r.code = 'admin';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","edit"]'
FROM sys_role r
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE r.code = 'admin'
ON DUPLICATE KEY UPDATE actions = '["view","edit"]';

-- 5) 部门侧：同 1)~3)（部门授权无超管兜底）
INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT DISTINCT dm.dept_id, m.id, '["view"]'
FROM sys_department_menu dm
JOIN sys_menu old ON old.id = dm.menu_id AND old.menu_key = 'ai-assistant-config'
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(dm.actions) AND JSON_CONTAINS(dm.actions, '"view"');

INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT DISTINCT dm.dept_id, m.id, '["view"]'
FROM sys_department_menu dm
JOIN sys_menu sib ON sib.id = dm.menu_id AND sib.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(dm.actions) AND JSON_CONTAINS(dm.actions, '"view"');

INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT DISTINCT dm.dept_id, m.id, '["view","edit"]'
FROM sys_department_menu dm
JOIN sys_menu sib ON sib.id = dm.menu_id AND sib.menu_key IN (
  'ai-assistant-capability', 'ai-assistant-profile', 'ai-assistant-glossary',
  'ai-assistant-knowledge', 'ai-assistant-guardrail')
JOIN sys_menu m ON m.menu_key IN (
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory')
WHERE JSON_VALID(dm.actions) AND JSON_CONTAINS(dm.actions, '"edit"')
ON DUPLICATE KEY UPDATE actions = '["view","edit"]';

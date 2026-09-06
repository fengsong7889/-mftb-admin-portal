-- ============================================================
-- 102_ai_access_request_menu.sql
-- 新增 AI 使用申請菜單（修復 PermissionAnnotationValidator 告警）
-- 同時授予 admin 角色全部權限
-- 冪等腳本，可重複執行
-- ============================================================

-- 1. 創建 AI 使用申請菜單
--    優先掛在 ai-assistant（智能中心）下；若 ai-assistant 不存在則作為頂級菜單
INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted)
SELECT
  COALESCE(
    (SELECT p.id FROM sys_menu p WHERE p.menu_key = 'ai-assistant' AND p.deleted = 0 LIMIT 1),
    (SELECT MIN(sub.id) FROM sys_menu sub WHERE sub.parent_id IS NULL AND sub.deleted = 0)
  ),
  'ai-access-request', 'AI 使用申請', '/ai-access-apply', 'AiAccessApply',
  'KeyOutlined', 2, 10, '["view","create","edit"]', 1, 'system', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-access-request' AND deleted = 0);

-- 2. 授予 admin 角色全部權限
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","create","edit","delete","export"]'
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND m.menu_key = 'ai-access-request' AND m.deleted = 0;

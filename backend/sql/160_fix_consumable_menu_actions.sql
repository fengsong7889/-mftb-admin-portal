-- =====================================================================
-- 160_fix_consumable_menu_actions.sql
-- 耗材管理菜单授权 actions 修复（幂等，可在 SQLPub 平台在线执行）
--
-- 问题现象:
--   MF00002（function_roles 绑定 admin 角色）登录后，耗材管理分组下
--   仅显示「耗材领用」，其余 4 个子菜单（看板/档案/库存/预警）不显示。
--
-- 根因:
--   ConsumableSchemaInitializer.seedMenus() 历史版本给 admin 角色授权时
--   使用 INSERT IGNORE INTO sys_role_menu (role_id, menu_id)，漏写 actions
--   字段，导致 6 条授权记录 actions=NULL。前端受控菜单要求 actions 非空，
--   故 consumable-dashboard/item/stock/alert 被整项过滤；
--   「耗材领用」前端不做权限控制，成为唯一可见子菜单。
--
-- 修复策略:
--   按各菜单的语义 actions 补齐（与 EAM 其他菜单授权格式一致）。
--   代码层已同步修复：种子逻辑 INSERT 带 actions + 启动自愈 UPDATE；
--   权限下发链路（mergePermissions/loadPermissions/permissionsOf）
--   对空 actions 兜底为 ["view"]。
-- =====================================================================

-- ── 1. 补齐 admin 角色对耗材菜单的 actions ──────────────────────────
UPDATE sys_role_menu rm
JOIN sys_menu m ON rm.menu_id = m.id AND m.deleted = 0
JOIN sys_role r ON rm.role_id = r.id AND r.code = 'admin'
SET rm.actions = CASE m.menu_key
    WHEN 'consumable-ops'       THEN '["view"]'
    WHEN 'consumable-dashboard' THEN '["view"]'
    WHEN 'consumable-item'      THEN '["view","create","edit","delete"]'
    WHEN 'consumable-claim'     THEN '["view","create","edit","delete"]'
    WHEN 'consumable-stock'     THEN '["view","create","edit"]'
    WHEN 'consumable-alert'     THEN '["view","edit"]'
    ELSE rm.actions END
WHERE m.menu_key IN ('consumable-ops', 'consumable-dashboard', 'consumable-item',
                     'consumable-claim', 'consumable-stock', 'consumable-alert')
  AND (rm.actions IS NULL OR rm.actions = '');

-- ── 2. 验证结果 ─────────────────────────────────────────────────────
SELECT r.code, m.menu_key, m.name, rm.actions
FROM sys_role_menu rm
JOIN sys_menu m ON rm.menu_id = m.id
JOIN sys_role r ON rm.role_id = r.id
WHERE m.menu_key LIKE 'consumable%' AND m.deleted = 0
ORDER BY m.id;

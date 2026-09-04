-- =====================================================================
-- 71_fix_menu_tree_structure.sql
-- 生产菜单结构错乱修复（幂等，可重复执行，可在 SQLPub 平台在线执行）
--
-- 问题现象:
--   1.「實驗沙盤」4 个子菜单(waterfall-simulation / algorithm-simulation /
--      merchant-score-insight / merchant-promotion-diagnose)变成一级菜单,
--      且菜单名称显示为原始 menu_key;
--   2. 一级菜单「團購管理」(group-purchase)侧边栏不显示, 已授权账号也看不到。
--
-- 根因:
--   角色/部门授权保存时, resolveMenuId 对 sys_menu 中不存在的菜单自动创建
--   "占位菜单"(name=menu_key, parent_id=NULL); 后端菜单树 buildTree 对孤儿
--   节点"作为顶层展示"兜底, 占位菜单因此顶到一级; 而 group-purchase 父菜单
--   行缺失, 侧边栏以后端菜单树渲染, 树里不存在的菜单授权了也无法显示。
--
-- 修复策略(与 DataInitializer.seedSystemMenus 种子定义对齐):
--   1. 补建 traffic-sandbox 父菜单(挂在 merchant_promotion 下, sort=8);
--   2. 沙盤 4 个子菜单: 缺失补建 / 占位(name=key 或 parent 为空)归位;
--   3. 补建 group-purchase 一级菜单及 4 个子菜单, 占位行同样归位;
--   4. 为 admin 角色补充上述菜单权限(与种子逻辑一致);
--   5. 为 MF00002 的绑定角色与所在部门幂等补齐團購管理权限
--      (仅补缺: 关联不存在时插入, actions 为空时才填充, 不覆盖人工授权)。
-- =====================================================================

-- ── 1. 實驗沙盤父菜单: 缺失补建 ─────────────────────────────────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, status, deleted)
SELECT p.id, 'traffic-sandbox', '實驗沙盤', 'Experiment Sandbox', 2, 8, 1, 0
FROM sys_menu p
WHERE p.menu_key = 'merchant_promotion' AND p.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT id FROM sys_menu WHERE menu_key = 'traffic-sandbox' AND deleted = 0) t
  );

-- 實驗沙盤父菜单: 占位行(name=key 或 parent 为空)归位
UPDATE sys_menu c
JOIN sys_menu p ON p.menu_key = 'merchant_promotion' AND p.deleted = 0
SET c.parent_id  = p.id,
    c.name       = '實驗沙盤',
    c.name_en    = 'Experiment Sandbox',
    c.type       = 2,
    c.sort_order = 8,
    c.status     = 1
WHERE c.menu_key = 'traffic-sandbox' AND c.deleted = 0
  AND (c.name = 'traffic-sandbox' OR c.parent_id IS NULL);

-- ── 2. 實驗沙盤 4 个子菜单: 缺失补建 ────────────────────────────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, status, deleted)
SELECT p.id, t.menu_key, t.name, t.name_en, 2, t.sort_order, 1, 0
FROM sys_menu p
JOIN (
  SELECT 'waterfall-simulation'        AS menu_key, '瀑布流推演'   AS name, 'Waterfall Simulation'   AS name_en, 1 AS sort_order
  UNION ALL
  SELECT 'algorithm-simulation',        '算法推演',     'Algorithm Simulation',   2
  UNION ALL
  SELECT 'merchant-score-insight',      '商家評分透視', 'Merchant Score Insight', 3
  UNION ALL
  SELECT 'merchant-promotion-diagnose', '商家推廣診斷', 'Promotion Diagnosis',    4
) t ON 1 = 1
WHERE p.menu_key = 'traffic-sandbox' AND p.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT menu_key FROM sys_menu WHERE deleted = 0) x
    WHERE x.menu_key = t.menu_key
  );

-- 實驗沙盤子菜单: 占位行归位(名称/层级/排序/英文名)
UPDATE sys_menu c
JOIN sys_menu p ON p.menu_key = 'traffic-sandbox' AND p.deleted = 0
JOIN (
  SELECT 'waterfall-simulation'        AS menu_key, '瀑布流推演'   AS name, 'Waterfall Simulation'   AS name_en, 1 AS sort_order
  UNION ALL
  SELECT 'algorithm-simulation',        '算法推演',     'Algorithm Simulation',   2
  UNION ALL
  SELECT 'merchant-score-insight',      '商家評分透視', 'Merchant Score Insight', 3
  UNION ALL
  SELECT 'merchant-promotion-diagnose', '商家推廣診斷', 'Promotion Diagnosis',    4
) t ON t.menu_key = c.menu_key
SET c.parent_id  = p.id,
    c.name       = t.name,
    c.name_en    = t.name_en,
    c.type       = 2,
    c.sort_order = t.sort_order,
    c.status     = 1
WHERE c.deleted = 0
  AND (c.name = c.menu_key OR c.parent_id IS NULL);

-- ── 3. 團購管理一级菜单: 缺失补建 / 占位归位 ─────────────────────────
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, status, deleted)
SELECT NULL, 'group-purchase', '團購管理', 'Group Purchase', 1, 7, 1, 0
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM sys_menu WHERE menu_key = 'group-purchase' AND deleted = 0) t
);

UPDATE sys_menu
SET name       = '團購管理',
    name_en    = 'Group Purchase',
    type       = 1,
    sort_order = 7,
    status     = 1
WHERE menu_key = 'group-purchase' AND deleted = 0 AND name = 'group-purchase';

-- 團購管理 4 个子菜单: 缺失补建
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, name_en, type, sort_order, status, deleted)
SELECT p.id, t.menu_key, t.name, t.name_en, 2, t.sort_order, 1, 0
FROM sys_menu p
JOIN (
  SELECT 'group-purchase-dashboard' AS menu_key, '秒殺數據總覽' AS name, 'Flash Sale Overview'     AS name_en, 1 AS sort_order
  UNION ALL
  SELECT 'flash-sale-register',      '秒殺商品登記', 'Flash Sale Register',     2
  UNION ALL
  SELECT 'flash-sale-stats',         '秒殺商品統計', 'Flash Sale Stats',        3
  UNION ALL
  SELECT 'flash-sale-price',         '澳覓秒殺價',   'Macau Flash Sale Price',  4
) t ON 1 = 1
WHERE p.menu_key = 'group-purchase' AND p.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT menu_key FROM sys_menu WHERE deleted = 0) x
    WHERE x.menu_key = t.menu_key
  );

-- 團購管理子菜单: 占位行归位
UPDATE sys_menu c
JOIN sys_menu p ON p.menu_key = 'group-purchase' AND p.deleted = 0
JOIN (
  SELECT 'group-purchase-dashboard' AS menu_key, '秒殺數據總覽' AS name, 'Flash Sale Overview'    AS name_en, 1 AS sort_order
  UNION ALL
  SELECT 'flash-sale-register',      '秒殺商品登記', 'Flash Sale Register',    2
  UNION ALL
  SELECT 'flash-sale-stats',         '秒殺商品統計', 'Flash Sale Stats',       3
  UNION ALL
  SELECT 'flash-sale-price',         '澳覓秒殺價',   'Macau Flash Sale Price', 4
) t ON t.menu_key = c.menu_key
SET c.parent_id  = p.id,
    c.name       = t.name,
    c.name_en    = t.name_en,
    c.type       = 2,
    c.sort_order = t.sort_order,
    c.status     = 1
WHERE c.deleted = 0
  AND (c.name = c.menu_key OR c.parent_id IS NULL);

-- ── 4. admin 角色补充上述菜单权限(与种子化逻辑一致) ─────────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r
JOIN sys_menu m ON m.deleted = 0
  AND m.menu_key IN (
    'traffic-sandbox', 'waterfall-simulation', 'algorithm-simulation',
    'merchant-score-insight', 'merchant-promotion-diagnose',
    'group-purchase', 'group-purchase-dashboard', 'flash-sale-register',
    'flash-sale-stats', 'flash-sale-price'
  )
WHERE r.code = 'admin' AND r.status = 1;

-- ── 5. MF00002 團購管理权限幂等补齐 ─────────────────────────────────
-- 5a. 部门维度: MF00002 所在部门
INSERT INTO sys_department_menu (dept_id, menu_id, actions)
SELECT u.department_id, m.id, t.actions
FROM sys_user u
JOIN (
  SELECT 'group-purchase'         AS menu_key, '["view"]'              AS actions
  UNION ALL
  SELECT 'group-purchase-dashboard', '["view","create"]'
  UNION ALL
  SELECT 'flash-sale-register',      '["view","create","export"]'
  UNION ALL
  SELECT 'flash-sale-stats',         '["view","create","export"]'
  UNION ALL
  SELECT 'flash-sale-price',         '["view","export"]'
) t ON 1 = 1
JOIN sys_menu m ON m.menu_key = t.menu_key AND m.deleted = 0
WHERE u.username = 'MF00002' AND u.deleted = 0 AND u.department_id IS NOT NULL
ON DUPLICATE KEY UPDATE actions = IFNULL(sys_department_menu.actions, VALUES(actions));

-- 5b. 角色维度: MF00002 绑定的功能角色(function_roles 为角色ID JSON数组)
INSERT INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, t.actions
FROM sys_user u
JOIN sys_role r ON r.status = 1
  AND u.function_roles IS NOT NULL
  AND u.function_roles != ''
  AND JSON_VALID(u.function_roles)
  AND JSON_CONTAINS(u.function_roles, CAST(r.id AS JSON))
JOIN (
  SELECT 'group-purchase'         AS menu_key, '["view"]'              AS actions
  UNION ALL
  SELECT 'group-purchase-dashboard', '["view","create"]'
  UNION ALL
  SELECT 'flash-sale-register',      '["view","create","export"]'
  UNION ALL
  SELECT 'flash-sale-stats',         '["view","create","export"]'
  UNION ALL
  SELECT 'flash-sale-price',         '["view","export"]'
) t ON 1 = 1
JOIN sys_menu m ON m.menu_key = t.menu_key AND m.deleted = 0
WHERE u.username = 'MF00002' AND u.deleted = 0
ON DUPLICATE KEY UPDATE actions = IFNULL(sys_role_menu.actions, VALUES(actions));

-- 执行后无需重启后端: 侧边栏菜单树实时读取 sys_menu;
-- MF00002 需重新登录(或刷新用户信息)以拉取最新权限列表。

-- =====================================================================
-- 112_fix_menu_sort_and_icon.sql
-- 生产环境菜单排序与图标修复（幂等，可在 SQLPub 平台在线执行）
--
-- 问题现象:
--   1. 生产环境菜单顺序与开发环境不一致：智能中心(AI)在團購管理前面
--   2. AI智能中心和團購管理的图标颜色互换
--   3. OA中心应在系統配置之后，但生产环境在權限管理之前
--
-- 根因:
--   seedSystemMenus() 对已存在且名称/层级匹配的菜单不更新 sort_order，
--   导致生产环境保留了旧版本的排序值。
--
-- 修复策略:
--   1. 调整顶级菜单 sort_order：團購管理=7, 智能中心AI=8, OA中心=12
--   2. 修正 group-purchase 和 ai-assistant 的图标
-- =====================================================================

-- ─ 1. 修正顶级菜单排序 ─────────────────────────────────────────────
UPDATE sys_menu SET sort_order = 7  WHERE menu_key = 'group-purchase'  AND sort_order != 7;
UPDATE sys_menu SET sort_order = 8  WHERE menu_key = 'ai-assistant'    AND sort_order != 8;
UPDATE sys_menu SET sort_order = 10 WHERE menu_key = 'permission'      AND sort_order != 10;
UPDATE sys_menu SET sort_order = 11 WHERE menu_key = 'system-config'   AND sort_order != 11;
UPDATE sys_menu SET sort_order = 12 WHERE menu_key = 'oa-center'       AND sort_order != 12;

-- ── 2. 修正菜单图标 ─────────────────────────────────────────────────
-- 團購管理：绿色购物袋图标
UPDATE sys_menu SET icon = 'ShoppingFilled'
WHERE menu_key = 'group-purchase'
  AND (icon IS NULL OR icon = '' OR icon = 'ShoppingCartOutlined');

-- 智能中心(AI)：机器人图标
UPDATE sys_menu SET icon = 'RobotOutlined'
WHERE menu_key = 'ai-assistant'
  AND (icon IS NULL OR icon = '' OR icon = 'ApiOutlined');

-- ── 3. 验证结果 ─────────────────────────────────────────────────────
SELECT menu_key, name, sort_order, icon
FROM sys_menu
WHERE menu_key IN ('group-purchase', 'ai-assistant', 'hr', 'oa-center', 'permission', 'system-config')
  AND deleted = 0
ORDER BY sort_order;

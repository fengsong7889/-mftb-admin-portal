-- =====================================================================
-- 112_fix_menu_sort_and_icon.sql
-- 生产环境菜单排序与图标修复（幂等，可在 SQLPub 平台在线执行）
--
-- 问题现象:
--   1. 生产环境菜单顺序与开发环境不一致：團購管理在智能中心(AI)前面、
--      OA中心排在最后（开发环境：智能中心AI=7, 團購管理=8, OA中心=10）
--   2. 智能中心(AI)和團購管理图标显示不一致
--
-- 根因:
--   1. 71_fix_menu_tree_structure.sql 曾将 group-purchase 的 sort_order 设为 7，
--      而 seedSystemMenus() 对名称/层级已匹配的菜单不覆盖 sort_order，
--      导致生产库保留错误排序；
--   2. 侧边栏图标颜色由 CSS nth-child 按菜单位置着色，
--      顺序错位导致两个菜单的颜色跟着错位。
--
-- 修复策略（对齐开发环境顺序）:
--   智能中心AI=7, 團購管理=8, OA中心=10, 權限管理=11, 系統配置=12
-- =====================================================================

-- ─ 1. 修正顶级菜单排序（对齐开发环境） ──────────────────────────────
UPDATE sys_menu SET sort_order = 7  WHERE menu_key = 'ai-assistant'    AND sort_order != 7;
UPDATE sys_menu SET sort_order = 8  WHERE menu_key = 'group-purchase'  AND sort_order != 8;
UPDATE sys_menu SET sort_order = 10 WHERE menu_key = 'oa-center'       AND sort_order != 10;
UPDATE sys_menu SET sort_order = 11 WHERE menu_key = 'permission'      AND sort_order != 11;
UPDATE sys_menu SET sort_order = 12 WHERE menu_key = 'system-config'   AND sort_order != 12;

-- ── 2. 修正菜单图标（无条件统一） ───────────────────────────────────
-- 智能中心(AI)：机器人图标
UPDATE sys_menu SET icon = 'RobotOutlined'    WHERE menu_key = 'ai-assistant';

-- 團購管理：购物袋图标
UPDATE sys_menu SET icon = 'ShoppingFilled'   WHERE menu_key = 'group-purchase';

-- ── 3. 验证结果 ─────────────────────────────────────────────────────
SELECT menu_key, name, sort_order, icon
FROM sys_menu
WHERE menu_key IN ('ai-assistant', 'group-purchase', 'hr', 'oa-center', 'permission', 'system-config')
  AND deleted = 0
ORDER BY sort_order;

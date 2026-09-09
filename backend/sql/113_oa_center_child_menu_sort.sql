-- =====================================================================
-- 113_oa_center_child_menu_sort.sql
-- OA中心子菜单排序修正（幂等，可在 SQLPub 平台在线执行）
--
-- 问题现象:
--   OA中心下子菜单顺序为：流程事項 → 流程中心 → 流程配置
--   期望顺序为：流程中心 → 流程事項 → 流程配置
--
-- 根因:
--   107_process_center_menu.sql 插入 process-center 时 sort_order=2，
--   而 oa-requests 原始 sort_order=1，导致流程事項排在流程中心前面。
--   DataInitializer.seedSystemMenus() 对已存在菜单不覆盖 sort_order，
--   因此生产库保留了错误排序。
--
-- 修复:
--   process-center  → sort_order = 1
--   oa-requests     → sort_order = 2
--   workflow-config  → sort_order = 3
-- =====================================================================

UPDATE sys_menu SET sort_order = 1 WHERE menu_key = 'process-center'  AND sort_order != 1;
UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'oa-requests'     AND sort_order != 2;
UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'workflow-config'  AND sort_order != 3;

-- 验证
SELECT p.menu_key AS parent_key, c.menu_key, c.name, c.sort_order
FROM sys_menu c
LEFT JOIN sys_menu p ON c.parent_id = p.id
WHERE p.menu_key = 'oa-center' AND c.deleted = 0
ORDER BY c.sort_order;

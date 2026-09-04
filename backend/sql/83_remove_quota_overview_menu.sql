-- ============================================================
-- 83_remove_quota_overview_menu.sql
-- 删除「使用量统计」菜单（ai-quota-overview）
-- 背景：该页面功能与「能耗统计」(ai_usage_stats) 高度重叠，
--       统一由能耗统计承接，避免两个入口展示相似数据。
-- ============================================================

DELETE FROM sys_menu WHERE menu_key = 'ai-quota-overview';

-- 验证
SELECT id, menu_key, name, parent_id FROM sys_menu WHERE menu_key = 'ai-quota-overview';

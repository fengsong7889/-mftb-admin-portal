-- ============================================================
-- 84_promote_auth_quota_menus.sql
-- 智能中心 (AI) 菜单结构升级：
--   1) 「模型授权管理」「配额管理」升级为二级菜单（直挂智能中心）
--   2) 去掉「AI 配额与策略管理」包装层（ai-quota-config 下线）
--   3) 恢复/保留「能耗统计」「能耗明细」菜单（防误删，缺失则重建）
--   4) 同级菜单重新排序
-- 脚本幂等，可重复执行。
-- 执行后：重新登录或刷新浏览器即可看到新菜单树。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 两个分组升级为二级菜单，直挂智能中心 (AI)
-- ------------------------------------------------------------
SET @ai_assistant_id = (SELECT id FROM sys_menu WHERE menu_key = 'ai-assistant' AND deleted = 0 LIMIT 1);

UPDATE sys_menu
SET parent_id = @ai_assistant_id, sort_order = 2, type = 1, deleted = 0, status = 1
WHERE menu_key = 'ai-auth-manage';

UPDATE sys_menu
SET parent_id = @ai_assistant_id, sort_order = 3, type = 1, deleted = 0, status = 1
WHERE menu_key = 'ai-quota-manage';

-- 分组图标兜底（83 号脚本已写入时此处为幂等重写）
UPDATE sys_menu SET icon = 'SafetyCertificateOutlined' WHERE menu_key = 'ai-auth-manage';
UPDATE sys_menu SET icon = 'DollarOutlined'            WHERE menu_key = 'ai-quota-manage';

-- ------------------------------------------------------------
-- 2. 去掉「AI 配额与策略管理」包装层
-- ------------------------------------------------------------
UPDATE sys_menu SET deleted = 1 WHERE menu_key = 'ai-quota-config';

-- ------------------------------------------------------------
-- 3. 同级菜单重新排序（模型管理=1 保持不变）
-- ------------------------------------------------------------
UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'ai_tool_registry';
UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'ai_usage_stats';
UPDATE sys_menu SET sort_order = 6 WHERE menu_key = 'ai_energy_detail';

-- ------------------------------------------------------------
-- 4. 恢复/保留能耗菜单：重置为启用态；行缺失时按原配置重建
-- ------------------------------------------------------------
UPDATE sys_menu
SET deleted = 0, status = 1, parent_id = @ai_assistant_id
WHERE menu_key IN ('ai_usage_stats', 'ai_energy_detail');

INSERT INTO sys_menu (parent_id, menu_key, name, path, type, sort_order, status, deleted, icon)
SELECT @ai_assistant_id, 'ai_usage_stats', '能耗统计', '/ai-usage-stats', 2, 5, 1, 0, 'LineChartOutlined'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai_usage_stats');

INSERT INTO sys_menu (parent_id, menu_key, name, path, type, sort_order, status, deleted, icon)
SELECT @ai_assistant_id, 'ai_energy_detail', '能耗明细', '/ai-energy-detail', 2, 6, 1, 0, 'FileSearchOutlined'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai_energy_detail');

-- ------------------------------------------------------------
-- 5. admin 角色关联补齐（升级后的两个分组 + 能耗菜单）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND r.deleted = 0
  AND m.menu_key IN ('ai-auth-manage', 'ai-quota-manage', 'ai_usage_stats', 'ai_energy_detail')
  AND m.deleted = 0;

-- ------------------------------------------------------------
-- 6. 验证：输出智能中心 (AI) 最新菜单树
-- ------------------------------------------------------------
SELECT p.menu_key AS parent_key, p.name AS parent_name, p.sort_order AS parent_sort,
       c.menu_key AS child_key, c.name AS child_name, c.sort_order AS child_sort, c.status
FROM sys_menu p
LEFT JOIN sys_menu c ON c.parent_id = p.id AND c.deleted = 0
WHERE p.parent_id = @ai_assistant_id AND p.deleted = 0
ORDER BY p.sort_order, c.sort_order;

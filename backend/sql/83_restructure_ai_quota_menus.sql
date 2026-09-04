-- ============================================================
-- 83_restructure_ai_quota_menus.sql
-- 「AI 配额与策略管理」菜单重构：拆分为两组二级菜单
--   AI 配额与策略管理 (ai-quota-config)
--   ├─ 模型授权管理 (ai-auth-manage)
--   │   ├─ 部门模型权控 (ai-dept-model-auth，原「按部门配置模型」)
--   │   └─ 员工模型权控 (ai-emp-model-auth，原「按员工/角色配置模型」)
--   └─ 配额管理 (ai-quota-manage)
--       ├─ 部门额度 (ai-dept-quota)
--       └─ 员工额度 (ai-emp-quota)
-- 原「额度策略」「模型路由策略」「使用量统计」菜单下线（功能由部门/员工额度承接）。
-- 本脚本幂等，可重复执行。
-- ============================================================

-- 1) 子菜单改名
UPDATE sys_menu SET name = '部门模型权控' WHERE menu_key = 'ai-dept-model-auth';
UPDATE sys_menu SET name = '员工模型权控' WHERE menu_key = 'ai-emp-model-auth';

-- 2) 新建两个分组菜单（缺失时插入）
SET @aqc = (SELECT id FROM sys_menu WHERE menu_key = 'ai-quota-config' AND deleted = 0 LIMIT 1);

INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted, icon)
SELECT @aqc, 'ai-auth-manage', '模型授权管理', 1, 1, 1, 0, 'SafetyCertificateOutlined' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-auth-manage');

INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted, icon)
SELECT @aqc, 'ai-quota-manage', '配额管理', 1, 2, 1, 0, 'DollarOutlined' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-quota-manage');

SET @am = (SELECT id FROM sys_menu WHERE menu_key = 'ai-auth-manage' AND deleted = 0 LIMIT 1);
SET @qm = (SELECT id FROM sys_menu WHERE menu_key = 'ai-quota-manage' AND deleted = 0 LIMIT 1);

-- 3) 权控子菜单挂到「模型授权管理」下
UPDATE sys_menu SET parent_id = @am, sort_order = 1, deleted = 0, icon = 'ApartmentOutlined' WHERE menu_key = 'ai-dept-model-auth';
UPDATE sys_menu SET parent_id = @am, sort_order = 2, deleted = 0, icon = 'TeamOutlined'       WHERE menu_key = 'ai-emp-model-auth';

-- 4) 新建额度子菜单（缺失时插入，含路径与图标）
INSERT INTO sys_menu (parent_id, menu_key, name, path, type, sort_order, status, deleted, icon)
SELECT @qm, 'ai-dept-quota', '部门额度', '/ai-dept-quota', 2, 1, 1, 0, 'AccountBookOutlined' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-dept-quota');

INSERT INTO sys_menu (parent_id, menu_key, name, path, type, sort_order, status, deleted, icon)
SELECT @qm, 'ai-emp-quota', '员工额度', '/ai-emp-quota', 2, 2, 1, 0, 'MoneyCollectOutlined' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'ai-emp-quota');

UPDATE sys_menu SET parent_id = @qm, path = '/ai-dept-quota', deleted = 0 WHERE menu_key = 'ai-dept-quota';
UPDATE sys_menu SET parent_id = @qm, path = '/ai-emp-quota',  deleted = 0 WHERE menu_key = 'ai-emp-quota';

-- 5) 旧菜单下线（额度策略 / 模型路由策略 / 使用量统计）
UPDATE sys_menu SET deleted = 1 WHERE menu_key IN ('ai-quota-policy', 'ai-routing-strategy', 'ai-quota-overview');

-- 6) 补 admin 角色关联（新菜单可见）
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND r.deleted = 0
  AND m.menu_key IN ('ai-auth-manage', 'ai-quota-manage', 'ai-dept-quota', 'ai-emp-quota',
                     'ai-dept-model-auth', 'ai-emp-model-auth')
  AND m.deleted = 0;

-- 验证：应看到两层新分组及 4 个叶子菜单，旧菜单 deleted=1
SELECT id, menu_key, name, parent_id, path, icon, sort_order, deleted
FROM sys_menu
WHERE menu_key IN ('ai-quota-config', 'ai-auth-manage', 'ai-quota-manage',
                   'ai-dept-model-auth', 'ai-emp-model-auth', 'ai-dept-quota', 'ai-emp-quota',
                   'ai-quota-policy', 'ai-routing-strategy', 'ai-quota-overview')
ORDER BY deleted, parent_id, sort_order;

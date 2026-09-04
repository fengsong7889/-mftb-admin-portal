-- ============================================================
-- 81_fix_gift_manage_children.sql
-- 修复「赠送管理」菜单点击报"该功能模块开发中"的问题
-- 根因：后端菜单树中 gift-manage 的子菜单（推广赠送/消费明细）
--       缺失或未关联角色，导致父菜单被渲染为叶子菜单，
--       点击时命中前端 keyToPath 未映射分支（提示开发中）。
-- 本脚本幂等：恢复/重建子菜单行 + 修正父级指向 + 补角色关联。
-- ============================================================

-- 1) 若子菜单行被逻辑删除/停用，先恢复
UPDATE sys_menu SET deleted = 0, status = 1
WHERE menu_key IN ('gift-detail', 'gift-consume-detail');

-- 2) 取「赠送管理」父菜单 ID
SET @gm_id = (SELECT id FROM sys_menu WHERE menu_key = 'gift-manage' AND deleted = 0 LIMIT 1);

-- 3) 子菜单行缺失时重建（INSERT...SELECT 同表子查询在 MySQL 中允许）
INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted)
SELECT @gm_id, 'gift-detail', '推廣贈送', 2, 1, 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'gift-detail');

INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted)
SELECT @gm_id, 'gift-consume-detail', '消費明細', 2, 2, 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'gift-consume-detail');

-- 4) 确保子菜单父级指向「赠送管理」（防止历史残留指向旧 ID）
UPDATE sys_menu SET parent_id = @gm_id
WHERE menu_key IN ('gift-detail', 'gift-consume-detail') AND deleted = 0;

-- 5) 补 admin 角色的菜单关联（缺失时插入，已存在忽略）
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.code = 'admin' AND r.deleted = 0
  AND m.menu_key IN ('gift-manage', 'gift-detail', 'gift-consume-detail')
  AND m.deleted = 0;

-- 验证：应看到 gift-manage 下有 2 个子菜单且角色关联齐全
SELECT m.id, m.menu_key, m.name, m.parent_id, m.status, m.deleted
FROM sys_menu m
WHERE m.menu_key IN ('gift-manage', 'gift-detail', 'gift-consume-detail');

SELECT rm.role_id, m.menu_key
FROM sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.id
WHERE m.menu_key IN ('gift-manage', 'gift-detail', 'gift-consume-detail');

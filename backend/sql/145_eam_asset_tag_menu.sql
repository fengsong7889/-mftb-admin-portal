-- 基础配置新增三级菜单：资产标签
-- 业务人员为资产贴上自定义标签模板，配置标签展示哪些资产字段及样式
-- DataInitializer 种子数据同步更新，本脚本可手动执行用于即时生效

-- 1. 新增菜单：资产标签（挂在 基础配置 asset-basic 下，排序第5）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, icon, type, sort_order, status, deleted)
SELECT id, 'asset-tag', '資產標籤', 'Asset Tag', '/asset-tag', 'TagOutlined', 2, 5, 1, 0
FROM sys_menu WHERE menu_key = 'asset-basic' AND deleted = 0
LIMIT 1;

-- 2. 为 admin 角色授权新菜单权限
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","add","edit","delete"]'
FROM sys_role r, sys_menu m
WHERE r.role_code = 'admin' AND m.menu_key = 'asset-tag' AND m.deleted = 0;

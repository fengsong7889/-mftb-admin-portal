-- 199: 商家工作台拆分——店铺随心推从广告推荐系统迁入独立 seller 系统
-- 实际幂等保证由 SystemPortalSchemaInitializer#ensureSellerWorkbench（Java 迁移）负责，
-- 本脚本仅为一次性参考文档（生产手工核对 / 回滚演练用），禁止直接照抄执行。
-- 报表层级归位与广告系统空目录 promotion_tool 停用由 core:seller-promotion-reports-v1.0 收尾。

-- 1. sys_system 种子（seedSystems 每次启动幂等刷新，等价 SQL）
INSERT INTO sys_system (code, name, name_en, description, icon, sort_order, status, deleted)
VALUES ('seller', '商家工作台', 'Merchant Workbench', '店铺随心推购买与推广报表，商家侧一站式工作空间', 'ShopOutlined', 25, 1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en),
                        description = VALUES(description), icon = VALUES(icon), sort_order = VALUES(sort_order);

-- 2. 顶级目录 seller-center（软删残留先物理清理，避免撞 uk_menu_key 全局唯一索引）
DELETE FROM sys_menu WHERE menu_key = 'seller-center' AND deleted = 1;
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, icon, type, sort_order, actions, system_code, status, deleted, updated_by)
VALUES (NULL, 'seller-center', '商家工作台', 'Merchant Workbench', '', 'ShopOutlined', 1, 15, '["view"]', 'seller', 1, 0, 'system');

-- 3. 随心推购买入口 + 报表分析组换父级（menu_id 不变，角色/部门菜单授权自动跟随）
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'seller-center' AND deleted = 0) t),
                    system_code = 'seller', updated_by = 'system'
WHERE menu_key IN ('promotion-sales-config', 'promotion-report-group') AND deleted = 0;

-- 4. 子树（报表叶子等）系统归属强制跟随
UPDATE sys_menu c JOIN sys_menu p ON c.parent_id = p.id
SET c.system_code = 'seller'
WHERE c.deleted = 0 AND p.system_code = 'seller' AND c.system_code <> 'seller';

-- 5. 准入反推：持有商家工作台子树菜单授权的角色/部门补授 seller，拆分不断权
INSERT IGNORE INTO sys_role_system (role_id, system_code)
SELECT DISTINCT rm.role_id, 'seller' FROM sys_role_menu rm
JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = 'seller'
JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1
WHERE r.code <> 'admin';

INSERT IGNORE INTO sys_department_system (dept_id, system_code)
SELECT DISTINCT dm.dept_id, 'seller' FROM sys_department_menu dm
JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = 'seller';

-- 6. admin 角色补授目录 view
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, sm.id, '["view"]' FROM sys_role r JOIN sys_menu sm ON sm.menu_key = 'seller-center' AND sm.deleted = 0
WHERE r.code = 'admin' AND r.deleted = 0;

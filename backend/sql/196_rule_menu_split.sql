-- 196: 規則配置拆分为「規則中心」目录 + 5 個版塊子菜單
-- 说明：本文件为一次性参考文档，实际幂等执行由 Java 迁移
--       DataInitializer.splitRuleConfigMenus()（versionKey=core:menu-seed-v44）负责。
-- 数据库：MySQL 8.x

-- 1. 新增「規則中心」目录（挂在 system-config 下）与 5 個版塊子菜單
--    （Java 迁移通过 seedSystemMenus 按 menu_key 幂等创建，等价 SQL 参考如下）
-- INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted, system_code)
--   SELECT id, 'rule-center', '規則中心', 2, 3, 1, 0, 'platform' FROM sys_menu WHERE menu_key='system-config' AND deleted=0;
--   （rule-ad-sales/rule-gift/rule-security/rule-algorithm/rule-seq 同理，parent=rule-center）

-- 2. 旧「規則配置」保留为总览，改名「規則總覽」
UPDATE sys_menu SET name = '規則總覽' WHERE menu_key = 'rule-config' AND deleted = 0 AND name = '規則配置';

-- 3. 新菜单回填系统归属 platform
UPDATE sys_menu SET system_code = 'platform'
 WHERE menu_key IN ('rule-center','rule-ad-sales','rule-gift','rule-security','rule-algorithm','rule-seq') AND deleted = 0;

-- 4. 存量持有 rule-config 的角色/部门授权笛卡尔复制到新子菜单 + asset-basic（INSERT IGNORE 幂等）
--    （Java 迁移 splitRuleConfigMenus 逐 childKey 执行，等价 SQL 参考：）
-- INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
--   SELECT rm.role_id, <child_menu_id>, rm.actions FROM sys_role_menu rm
--   WHERE rm.menu_id = (SELECT id FROM sys_menu WHERE menu_key='rule-config' AND deleted=0);
-- INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
--   SELECT dm.dept_id, <child_menu_id>, dm.actions FROM sys_department_menu dm
--   WHERE dm.menu_id = (SELECT id FROM sys_menu WHERE menu_key='rule-config' AND deleted=0);

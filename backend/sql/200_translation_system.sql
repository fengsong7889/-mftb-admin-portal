-- 200: 翻译中心独立系统——i18n-center 菜单树从 platform 拆出归 i18n
-- 实际幂等保证由 SystemPortalSchemaInitializer#reconcileTranslationSystem（Java 迁移）负责，
-- 本脚本仅为一次性参考文档（生产手工核对用），禁止直接照抄执行。

-- 1. sys_system 种子（seedSystems 每次启动幂等刷新，等价 SQL）
INSERT INTO sys_system (code, name, name_en, description, icon, sort_order, status, deleted)
VALUES ('i18n', '翻譯中心', 'Translation Center', '多语言翻译、语料维护与质量校验，连接全球业务', 'GlobalOutlined', 110, 1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en),
                        description = VALUES(description), icon = VALUES(icon), sort_order = VALUES(sort_order);

-- 2. i18n-center 整棵子树 system_code 改写（根 + 逐层向下，Java 内迭代实现）
UPDATE sys_menu SET system_code = 'i18n', updated_by = 'system'
WHERE menu_key = 'i18n-center' AND deleted = 0;

UPDATE sys_menu c JOIN sys_menu p ON c.parent_id = p.id
SET c.system_code = 'i18n', c.updated_by = 'system'
WHERE c.deleted = 0 AND p.system_code = 'i18n' AND (c.system_code IS NULL OR c.system_code <> 'i18n');

-- 3. 准入反推：持有翻译中心菜单授权的角色/部门补授 i18n 系统准入
INSERT IGNORE INTO sys_role_system (role_id, system_code)
SELECT DISTINCT rm.role_id, 'i18n' FROM sys_role_menu rm
JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = 'i18n'
JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1
WHERE r.code <> 'admin';

INSERT IGNORE INTO sys_department_system (dept_id, system_code)
SELECT DISTINCT dm.dept_id, 'i18n' FROM sys_department_menu dm
JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = 'i18n';

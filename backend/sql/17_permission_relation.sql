-- ============================================================
-- MFTB 搜广推系统 - 角色/部门权限关联表迁移
-- 将 sys_role.permissions / sys_department.permissions 的 JSON 数据
-- 迁移到 sys_role_menu / sys_department_menu 关联表
-- 首次启动时 DataInitializer 会自动完成等效迁移, 本脚本供手动执行参考
-- ============================================================

-- 1. 角色-菜单权限关联表
CREATE TABLE IF NOT EXISTS sys_role_menu (
    role_id BIGINT NOT NULL COMMENT '角色ID',
    menu_id BIGINT NOT NULL COMMENT '菜单ID',
    actions TEXT NULL COMMENT '允许的操作 JSON数组',
    PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-菜单权限关联表';

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_role_menu ADD COLUMN actions TEXT NULL COMMENT ''允许的操作 JSON数组''',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_role_menu' AND COLUMN_NAME = 'actions');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 部门-菜单权限关联表
CREATE TABLE IF NOT EXISTS sys_department_menu (
    dept_id BIGINT NOT NULL COMMENT '部门ID',
    menu_id BIGINT NOT NULL COMMENT '菜单ID',
    actions TEXT NULL COMMENT '允许的操作 JSON数组',
    PRIMARY KEY (dept_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门-菜单权限关联表';

-- 3. 确保 sys_menu 存在且 menu_key 有唯一索引 (供后续关联使用)
-- 注意: 若 sys_menu 表为空, 需要先执行 16_menu_config.sql

-- 4. 迁移角色权限 (按角色幂等: 已存在关联的角色跳过)
-- 由于 JSON 解析在纯 SQL 中较复杂, 建议在应用启动时由 DataInitializer 完成迁移,
-- 或编写临时脚本按业务数据手动处理。
-- 下面给出基于占位菜单的简化迁移示例:
INSERT IGNORE INTO sys_menu (menu_key, name, type, status, deleted, sort_order)
SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(perm, '$.menuKey')), JSON_UNQUOTE(JSON_EXTRACT(perm, '$.menuKey')), 2, 1, 0, 0
FROM sys_role,
     JSON_TABLE(permissions, '$[*]' COLUMNS (perm JSON PATH '$')) AS jt
WHERE permissions IS NOT NULL AND permissions != '' AND permissions != '[]';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, JSON_ARRAYAGG(JSON_UNQUOTE(JSON_EXTRACT(perm, '$.actions')))
FROM sys_role r
         JOIN JSON_TABLE(r.permissions, '$[*]' COLUMNS (perm JSON PATH '$')) AS jt
         JOIN sys_menu m ON m.menu_key = JSON_UNQUOTE(JSON_EXTRACT(perm, '$.menuKey'))
WHERE r.permissions IS NOT NULL AND r.permissions != '' AND r.permissions != '[]'
  AND r.id NOT IN (SELECT DISTINCT role_id FROM sys_role_menu)
GROUP BY r.id, m.id;

-- 5. 迁移部门权限 (按部门幂等)
INSERT IGNORE INTO sys_menu (menu_key, name, type, status, deleted, sort_order)
SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(perm, '$.menuKey')), JSON_UNQUOTE(JSON_EXTRACT(perm, '$.menuKey')), 2, 1, 0, 0
FROM sys_department,
     JSON_TABLE(permissions, '$[*]' COLUMNS (perm JSON PATH '$')) AS jt
WHERE permissions IS NOT NULL AND permissions != '' AND permissions != '[]';

INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT d.id, m.id, JSON_ARRAYAGG(JSON_UNQUOTE(JSON_EXTRACT(perm, '$.actions')))
FROM sys_department d
         JOIN JSON_TABLE(d.permissions, '$[*]' COLUMNS (perm JSON PATH '$')) AS jt
         JOIN sys_menu m ON m.menu_key = JSON_UNQUOTE(JSON_EXTRACT(perm, '$.menuKey'))
WHERE d.permissions IS NOT NULL AND d.permissions != '' AND d.permissions != '[]'
  AND d.id NOT IN (SELECT DISTINCT dept_id FROM sys_department_menu)
GROUP BY d.id, m.id;

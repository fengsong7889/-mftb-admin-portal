-- 194: 权限中心重构 · 统一授权中心（一次性参考文档，实际执行由 Java 迁移负责：
--      iam:perm-audit-table:v1.0 → PermissionAuditSchemaInitializer
--      iam:authz-center-menu:v1.0 → AuthzCenterMenuInitializer）

-- 1. 授权变更审计日志表
CREATE TABLE IF NOT EXISTS sys_permission_audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    target_type VARCHAR(20) NOT NULL COMMENT '授权对象类型: role/department',
    target_id BIGINT NOT NULL COMMENT '角色ID 或 部门ID',
    target_name VARCHAR(128) DEFAULT NULL COMMENT '目标名称快照',
    system_code VARCHAR(64) DEFAULT NULL COMMENT '业务系统编码, 跨系统操作为 NULL',
    change_type VARCHAR(20) NOT NULL COMMENT '变更类型: GRANT/REVOKE/UPDATE/DELETE/COPY/BIND/STATUS',
    before_snapshot TEXT DEFAULT NULL COMMENT '变更前快照 JSON',
    after_snapshot TEXT DEFAULT NULL COMMENT '变更后快照 JSON',
    operator VARCHAR(64) DEFAULT NULL COMMENT '操作人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    KEY idx_perm_audit_target (target_type, target_id, created_at),
    KEY idx_perm_audit_operator (operator, created_at),
    KEY idx_perm_audit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='授权变更审计日志表';

-- 2. 授权中心菜单（parent=permission, 归属 iam 系统, 排第 1 位）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted)
SELECT p.id, 'authorization-center', '授權中心', 'Authorization Center',
       '/authorization-center', 'AuthorizationCenter', 'SafetyOutlined', 2, 0,
       '["view","create","edit","delete"]', 'iam', 1, 'system', 0
FROM sys_menu p
WHERE p.menu_key = 'permission' AND p.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'authorization-center' AND deleted = 0);

-- 3. 存量目标对旧授权菜单的授权合并到新菜单（Java 迁移内做 union 合并，此处示意）
-- INSERT INTO sys_role_menu (role_id, menu_id, actions) SELECT ... ON DUPLICATE KEY UPDATE ...
-- INSERT INTO sys_department_menu (dept_id, menu_id, actions) SELECT ... ON DUPLICATE KEY UPDATE ...

-- 4. admin 角色回填全量动作
INSERT INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","create","edit","delete"]'
FROM sys_role r JOIN sys_menu m ON m.menu_key = 'authorization-center' AND m.deleted = 0
WHERE r.code = 'admin' AND r.deleted = 0
ON DUPLICATE KEY UPDATE actions = VALUES(actions);

-- 5. 旧「功能授權」「系統授權」菜单停用（不物理删除，保留回滚能力）
UPDATE sys_menu SET status = 0, updated_by = 'system'
WHERE menu_key IN ('function-permission', 'system-authorization') AND deleted = 0;

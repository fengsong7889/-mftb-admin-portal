-- 203: 產研協同系統（RDM）菜单与系统清单种子
--      一次性参考文档；实际执行与幂等由 RdmMenuInitializer 负责（版本键 rdm:menu-seed:v1.0）。
--      归属系统：sys_system.code = 'rdm'（SystemCode.RDM），门户排序 75，介于物資管理(70) 与 OA(80) 之间。
--      仅允许 INSERT / ON DUPLICATE KEY UPDATE，无任何破坏性语句。

-- 1) 系统清单（门户卡片与系统准入真值）
INSERT INTO sys_system (code, name, name_en, description, icon, sort_order, status, deleted)
VALUES ('rdm', '產研協同系統', 'R&D Collaboration',
        '需求提交、审批、分配、研发交付、验收上线与产出看板', 'ProjectOutlined', 75, 1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en),
                        description = VALUES(description), icon = VALUES(icon), sort_order = VALUES(sort_order);

-- 2) 一级菜单（已拍平：不再包一层 rdm-center 目录，sort_order 接在既有顶级菜单之后）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted)
VALUES (NULL, 'rdm-workbench', '需求工作台', 'Requirement Workbench', '/rdm-workbench', 'RdmWorkbench', 'DashboardOutlined', 2, 16, '["view"]', 'rdm', 1, 'system', 0)
ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), system_code = VALUES(system_code),
                        status = 1, deleted = 0, type = VALUES(type);

-- 3) 其余业务菜单（全部为顶级菜单，parent_id = NULL；sort 接在 i18n-center(15) 之后）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted)
SELECT NULL, t.menu_key, t.name, t.name_en, t.path, t.component, t.icon, t.type, t.sort_order, t.actions, 'rdm', 1, 'system', 0
FROM (
    SELECT 'rdm-submit'      AS menu_key, '提交需求'      AS name, 'Submit Requirement'       AS name_en, '/rdm-submit'      AS path, 'RequirementSubmit'   AS component, 'FormOutlined'       AS icon, 2 AS type, 17 AS sort_order, '["view","create"]' AS actions
    UNION ALL SELECT 'rdm-requirement',  '我的需求',       'My Requirements',                  '/rdm-requirement',  'RequirementList',      'FileTextOutlined',    2, 18, '["view","export"]'
    UNION ALL SELECT 'rdm-intake',       '需求池/分配',    'Requirement Pool',                 '/rdm-intake',       'RequirementPool',      'InboxOutlined',       2, 19, '["view","create","edit","delete","export"]'
    UNION ALL SELECT 'rdm-product',      '產品需求處理',   'Product Backlog',                  '/rdm-product',      'ProductBoard',         'AppstoreOutlined',    2, 20, '["view","create","edit","delete","export"]'
    UNION ALL SELECT 'rdm-acceptance',   '需求驗收',       'Requirement Acceptance',           '/rdm-acceptance',   'AcceptanceList',       'CheckSquareOutlined', 2, 21, '["view","create"]'
    UNION ALL SELECT 'rdm-dashboard',    '需求看板',       'Requirement Dashboard',            '/rdm-dashboard',    'RdmDashboard',         'RiseOutlined',        2, 22, '["view","export"]'
    UNION ALL SELECT 'rdm-config-group', '需求配置',       'Requirement Settings',             NULL,                NULL,                   'SettingOutlined',     1, 23, '["view"]'
) t
ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), system_code = VALUES(system_code), status = 1, deleted = 0;

-- 4) 配置分组下的三个叶子（父级 rdm-config-group）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted)
SELECT g.id, s.menu_key, s.name, s.name_en, s.path, s.component, s.icon, 2, s.sort_order, '["view","edit"]', 'rdm', 1, 'system', 0
FROM sys_menu g
JOIN (
    SELECT 'rdm-config-status'  AS menu_key, '狀態與流轉' AS name, 'Status & Transition' AS name_en, '/rdm-config-status'  AS path, 'StatusConfig'  AS component, 'PartitionOutlined' AS icon, 1 AS sort_order
    UNION ALL SELECT 'rdm-config-routing', '分發矩陣',     'Assignment Matrix',     '/rdm-config-routing', 'RoutingConfig',  'SwapOutlined',      2
    UNION ALL SELECT 'rdm-config-sla',     'SLA 與逾期',   'SLA & Overdue',         '/rdm-config-sla',     'SlaConfig',      'FieldTimeOutlined', 3
) s
WHERE g.menu_key = 'rdm-config-group' AND g.deleted = 0
ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), system_code = VALUES(system_code), status = 1, deleted = 0;

-- 5) admin 角色授权 + rdm 系统准入（按菜单授权反推，非超管授权走「功能授权」界面）
INSERT INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, m.actions
FROM sys_role r
JOIN sys_menu m ON m.system_code = 'rdm' AND m.deleted = 0 AND m.status = 1
WHERE r.code = 'admin' AND r.deleted = 0
ON DUPLICATE KEY UPDATE actions = VALUES(actions);

INSERT IGNORE INTO sys_role_system (role_id, system_code)
SELECT DISTINCT rm.role_id, 'rdm'
FROM sys_role_menu rm
JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = 'rdm'
JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1;

INSERT IGNORE INTO sys_department_system (dept_id, system_code)
SELECT DISTINCT dm.dept_id, 'rdm'
FROM sys_department_menu dm
JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = 'rdm';

-- 6) 验证
SELECT code, name, icon, sort_order FROM sys_system WHERE code = 'rdm';
SELECT menu_key, name, path, system_code, status FROM sys_menu WHERE system_code = 'rdm' AND deleted = 0 ORDER BY parent_id, sort_order;

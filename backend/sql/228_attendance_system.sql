-- 228: 考勤假勤系统（attendance）独立入口 —— 菜单与系统清单种子
--      一次性参考文档；实际执行与幂等由 AttendanceMenuInitializer 负责
--      （versionKey = attendance:menu:v1.0，已登记 catalog.json，phase = MENU_SEED）。
--      归属系统：sys_system.code = 'attendance'（SystemCode.ATTENDANCE），门户排序 65，
--      介于人力資源系統(60) 与物資管理系統(70) 之间。
--      仅允许 INSERT / ON DUPLICATE KEY UPDATE / 条件化 UPDATE，无任何破坏性语句。

-- 1) 系统清单（门户卡片与系统准入真值；实际由 seedSystems 每次启动幂等刷回）
INSERT INTO sys_system (code, name, name_en, description, icon, sort_order, status, deleted)
VALUES ('attendance', '考勤假勤系統', 'Workforce & Attendance',
        '打卡排班、請假額度與考勤匯總，為薪酬核算提供取數', 'ClockCircleOutlined', 65, 1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en),
                        description = VALUES(description), icon = VALUES(icon), sort_order = VALUES(sort_order);

-- 2) 顶级菜单（10 条，parent_id = NULL，sort 接在產研交付 16..25 之后的 26..37，请假两条占 33/34）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, sort_order, actions, system_code, status, updated_by, deleted)
SELECT NULL, t.menu_key, t.name, t.name_en, t.path, t.component, t.icon, 2, t.sort_order, t.actions, 'attendance', 1, 'system', 0
FROM (
    SELECT 'attendance-workbench' AS menu_key, '假勤工作台'    AS name, 'Attendance Workbench'   AS name_en, '/attendance-workbench' AS path, 'AttendanceWorkbench'      AS component, 'ClockCircleOutlined'      AS icon, 26 AS sort_order, '["view"]' AS actions
    UNION ALL SELECT 'attendance-group',    '考勤組與規則',  'Attendance Groups',     '/attendance-group',    'AttendanceGroupList',     'GroupOutlined',             27, '["view","create","edit","delete","export"]'
    UNION ALL SELECT 'attendance-shift',    '班次管理',      'Shifts',                '/attendance-shift',    'AttendanceShiftList',     'RetweetOutlined',             28, '["view","create","edit","delete","export"]'
    UNION ALL SELECT 'attendance-holiday',  '節假日日曆',    'Holiday Calendar',      '/attendance-holiday',  'AttendanceHolidayList',   'SnippetsOutlined',            29, '["view","create","edit","delete","import"]'
    UNION ALL SELECT 'attendance-schedule', '排班管理',      'Scheduling',            '/attendance-schedule', 'AttendanceSchedule',      'BorderOutlined',              30, '["view","edit","import","export"]'
    UNION ALL SELECT 'attendance-punch',    '打卡記錄',      'Punch Records',         '/attendance-punch',    'AttendancePunchList',     'ScanOutlined',                31, '["view","import","export"]'
    UNION ALL SELECT 'attendance-exception','異常處理',      'Attendance Exceptions', '/attendance-exception','AttendanceExceptionList', 'ExclamationCircleOutlined',   32, '["view","edit","export"]'
    UNION ALL SELECT 'attendance-daily',    '考勤日報',      'Daily Attendance',      '/attendance-daily',    'AttendanceDailyReport',   'AreaChartOutlined',           35, '["view","edit","export"]'
    UNION ALL SELECT 'attendance-monthly',  '月度考勤匯總',  'Monthly Attendance',    '/attendance-monthly',  'AttendanceMonthlyReport', 'PayCircleOutlined',           36, '["view","edit","export"]'
    UNION ALL SELECT 'attendance-setting',  '假勤設置',      'Attendance Settings',   '/attendance-setting',  'AttendanceSetting',       'FunctionOutlined',              37, '["view","edit"]'
) t
ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), system_code = VALUES(system_code),
                        status = 1, deleted = 0, type = VALUES(type);

-- 3) 请假两条菜单从人力资源系统的「員工檔案」分组迁入本系统顶级
--    只改 parent_id / system_code / sort_order，绝不动 menu_key / path / actions：
--    菜单行 id 不变，sys_role_menu 与 sys_department_menu 的存量授权随行；改 key 会让授权集体失效。
--    WHERE 带「父级仍是 hr-profile」条件，避免每次启动把管理员的自定义调整顶回去。
UPDATE sys_menu
SET parent_id = NULL, system_code = 'attendance', updated_by = 'system'
WHERE menu_key IN ('hr-leave', 'hr-leave-quota') AND deleted = 0
  AND parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'hr-profile' AND deleted = 0 LIMIT 1) x);

-- 排序仅在当前值仍等于旧默认值时对齐（请假原为分组内 3/4）
UPDATE sys_menu SET sort_order = 33, updated_by = 'system'
WHERE menu_key = 'hr-leave' AND deleted = 0 AND sort_order = 3;
UPDATE sys_menu SET sort_order = 34, updated_by = 'system'
WHERE menu_key = 'hr-leave-quota' AND deleted = 0 AND sort_order = 4;

-- 4) admin 角色授权 + attendance 系统准入（按菜单授权反推，非超管授权走「授权中心」界面）
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, m.actions
FROM sys_role r
JOIN sys_menu m ON m.system_code = 'attendance' AND m.deleted = 0 AND m.status = 1
WHERE r.code = 'admin' AND r.deleted = 0;

INSERT IGNORE INTO sys_role_system (role_id, system_code)
SELECT DISTINCT rm.role_id, 'attendance' FROM sys_role_menu rm
JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = 'attendance'
JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1
WHERE r.code <> 'admin';

INSERT IGNORE INTO sys_department_system (dept_id, system_code)
SELECT DISTINCT dm.dept_id, 'attendance' FROM sys_department_menu dm
JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = 'attendance';

-- 5) 验证
SELECT code, name, icon, sort_order FROM sys_system WHERE code = 'attendance';
SELECT menu_key, name, path, system_code, status FROM sys_menu
WHERE system_code = 'attendance' AND deleted = 0 ORDER BY sort_order;

-- 6) v1.1 纠正（attendance:menu:v1.1）：日報菜單補齊 edit 動作
--    原因：「重算區間日報」會改日報、生成異常並回寫打卡判定，屬寫操作；
--    v1.0 把日報當純只讀菜單只給了 view/export，而 sys_menu.actions 是授權中心
--    能勾出什麼動作的唯一依據，缺 edit 則該能力對普通角色永遠 403。
--    只動日報這一個菜單：批量對齊會把管理員在授權中心主動收窄過的動作集擴回去（靜默擴權）。
UPDATE sys_menu SET actions = '["view","edit","export"]', updated_by = 'system'
WHERE menu_key = 'attendance-daily' AND deleted = 0
  AND (actions IS NULL OR actions <> '["view","edit","export"]');

-- admin 是內置運維角色，重算日報必須能做；其他角色的授權行不動，由管理員自行勾選
UPDATE sys_role_menu SET actions = '["view","edit","export"]'
WHERE menu_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-daily' AND deleted = 0 LIMIT 1) x)
  AND role_id = (SELECT id FROM (SELECT id FROM sys_role WHERE code = 'admin' AND deleted = 0 LIMIT 1) y);

-- ============================================================
-- 回滚（按需手工执行，禁止随迁移自动跑）
-- ============================================================
-- UPDATE sys_menu SET status = 0, updated_by = 'system' WHERE system_code = 'attendance' AND deleted = 0;
-- UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'hr-profile' AND deleted = 0 LIMIT 1) x),
--                     system_code = 'hr', sort_order = CASE menu_key WHEN 'hr-leave' THEN 3 WHEN 'hr-leave-quota' THEN 4 END,
--                     updated_by = 'system'
-- WHERE menu_key IN ('hr-leave', 'hr-leave-quota') AND deleted = 0;
-- DELETE FROM sys_role_system WHERE system_code = 'attendance';
-- DELETE FROM sys_department_system WHERE system_code = 'attendance';
-- DELETE FROM sys_system WHERE code = 'attendance';
-- DELETE FROM sys_schema_version WHERE version_key IN ('attendance:menu:v1.0', 'attendance:menu:v1.1');

-- ============================================================
-- 7) v2.0 菜单分组（attendance:menu:v2.0）
--    把平铺的 12 个叶子菜单收入 4 个分组（type=1），
--    假勤工作台与假勤設置保持独立顶级。
--    排序遵循管理动线：工作台 → 日常操作 → 基础数据 → 请假 → 报表 → 设置。
--    实际执行与幂等由 AttendanceMenuInitializer.groupMenus() 负责。
-- ============================================================

-- 4 个分组菜单（type=1，无 path/component/actions）
INSERT INTO sys_menu (parent_id, menu_key, name, name_en, type, icon, sort_order, actions, status, system_code, updated_by, deleted)
SELECT NULL, t.menu_key, t.name, t.name_en, 1, t.icon, t.sort_order, '', 1, 'attendance', 'system', 0
FROM (
    SELECT 'attendance-ops-group'    AS menu_key, '考勤管理'   AS name, 'Attendance Ops'     AS name_en, 'ScheduleOutlined' AS icon, 27 AS sort_order
    UNION ALL SELECT 'attendance-basic-group',  '基礎設置',     'Basic Setup',       'ControlOutlined',  28
    UNION ALL SELECT 'attendance-leave-group',  '請假管理',     'Leave Management',  'BarChartOutlined', 29
    UNION ALL SELECT 'attendance-report-group', '報表統計',     'Reports',           'PieChartOutlined', 30
) t
ON DUPLICATE KEY UPDATE type = 1, icon = VALUES(icon), system_code = 'attendance',
                        status = 1, deleted = 0;

-- 叶子菜单挂入分组（仅当当前仍是顶级时移动）
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-ops-group' AND deleted = 0 LIMIT 1) g), sort_order = 1 WHERE menu_key = 'attendance-group'    AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-ops-group' AND deleted = 0 LIMIT 1) g), sort_order = 2 WHERE menu_key = 'attendance-schedule'  AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-ops-group' AND deleted = 0 LIMIT 1) g), sort_order = 3 WHERE menu_key = 'attendance-punch'     AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-ops-group' AND deleted = 0 LIMIT 1) g), sort_order = 4 WHERE menu_key = 'attendance-exception'  AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-basic-group' AND deleted = 0 LIMIT 1) g), sort_order = 1 WHERE menu_key = 'attendance-shift'     AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-basic-group' AND deleted = 0 LIMIT 1) g), sort_order = 2 WHERE menu_key = 'attendance-holiday'   AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-leave-group' AND deleted = 0 LIMIT 1) g), sort_order = 1 WHERE menu_key = 'hr-leave'            AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-leave-group' AND deleted = 0 LIMIT 1) g), sort_order = 2 WHERE menu_key = 'hr-leave-quota'      AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-report-group' AND deleted = 0 LIMIT 1) g), sort_order = 1 WHERE menu_key = 'attendance-daily'     AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET parent_id = (SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'attendance-report-group' AND deleted = 0 LIMIT 1) g), sort_order = 2 WHERE menu_key = 'attendance-monthly'   AND deleted = 0 AND parent_id IS NULL;

-- 顶级排序重写
UPDATE sys_menu SET sort_order = 26 WHERE menu_key = 'attendance-workbench' AND deleted = 0 AND parent_id IS NULL;
UPDATE sys_menu SET sort_order = 31 WHERE menu_key = 'attendance-setting'   AND deleted = 0 AND parent_id IS NULL;

-- 回滚分组（按需手工执行）
-- UPDATE sys_menu SET parent_id = NULL, sort_order = CASE menu_key
--     WHEN 'attendance-group' THEN 27 WHEN 'attendance-shift' THEN 28 WHEN 'attendance-holiday' THEN 29
--     WHEN 'attendance-schedule' THEN 30 WHEN 'attendance-punch' THEN 31 WHEN 'attendance-exception' THEN 32
--     WHEN 'hr-leave' THEN 33 WHEN 'hr-leave-quota' THEN 34
--     WHEN 'attendance-daily' THEN 35 WHEN 'attendance-monthly' THEN 36 WHEN 'attendance-setting' THEN 37 END,
--     updated_by = 'system'
-- WHERE menu_key IN ('attendance-group','attendance-shift','attendance-holiday','attendance-schedule',
--     'attendance-punch','attendance-exception','hr-leave','hr-leave-quota','attendance-daily','attendance-monthly','attendance-setting')
-- AND deleted = 0;
-- DELETE FROM sys_menu WHERE menu_key IN ('attendance-ops-group','attendance-basic-group','attendance-leave-group','attendance-report-group');
-- DELETE FROM sys_schema_version WHERE version_key = 'attendance:menu:v2.0';

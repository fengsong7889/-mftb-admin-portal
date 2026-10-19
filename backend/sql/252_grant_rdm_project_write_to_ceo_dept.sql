-- ============================================================================
-- 252: 把「項目總覽」写权与配套读权授给董事長兼首席執行官辦公室（dept_id=5）
--
-- 背景（端到端实测出来的，不是推断）：
--   1) 菜单可授动作集原本只有 ["view","export"]（见 rdm:menu-seed:v3.17），
--      授权中心勾不到 create/edit，非超管账号点「新增項目 / 編輯 / 暫停項目」一律
--      403「没有 [rdm-dashboard-project] 的[新增|编辑]权限」；
--   2) 该账号还缺 employee-management:view 与 org-structure:view，
--      导致新增/编辑表单里的 EmployeeSelect（在职员工远程搜索）与部门下拉恒为「無此資料」。
--   超管靠代码直通（sys_role.code='admin'），不查授权行，所以这两条从超管视角永远看不见。
--
-- 为什么走部门锚点而不是角色锚点：
--   MF00001 的功能角色是 FIN_BIZ_APPROVER（业务主管审批），那是一张全公司共用的宽角色，
--   把项目写权写进 sys_role_menu 等于给每一位业务主管开「建项目/暂停别人的项目」。
--   dept_id=5 只有 3 个账号（董事長兼首席執行官辦公室），影响面最小。
--
-- 幂等与「撤权不复活」：
--   全部用 INSERT IGNORE + 主键 (dept_id, menu_id)：缺行才建，已有行**绝不覆盖**，
--   避免把管理员后来撤销/自定义的动作集悄悄刷回来；重复执行零副作用。
--   本脚本是一次性授权数据脚本，不进任何每次启动重放的初始化器。
-- ============================================================================

-- 1) 項目總覽：新增(create) + 编辑/暂停恢复(edit) + 原有查看/导出
INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT 5, id, '["view","create","edit","export"]'
FROM sys_menu
WHERE menu_key = 'rdm-dashboard-project' AND deleted = 0;

-- 2) 員工管理：只补查看（EmployeeSelect 的在职员工远程搜索接口按此动作鉴权）
--    注意只给 view，不给 salaryView / sensitiveView / accountEdit 等敏感动作
INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT 5, id, '["view"]'
FROM sys_menu
WHERE menu_key = 'employee-management' AND deleted = 0;

-- 3) 部門架構：只补查看（部门树/TreeSelect 数据源按此动作鉴权）
INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions)
SELECT 5, id, '["view"]'
FROM sys_menu
WHERE menu_key = 'org-structure' AND deleted = 0;

-- ============================================================================
-- 复核（期望三行：rdm-dashboard-project 含 create/edit，另两行为 ["view"]）
-- SELECT m.menu_key, dm.actions
-- FROM sys_department_menu dm JOIN sys_menu m ON m.id = dm.menu_id
-- WHERE dm.dept_id = 5
--   AND m.menu_key IN ('rdm-dashboard-project', 'employee-management', 'org-structure');
--
-- 回滚（撤销本次授权，只删自己插入的行）
-- DELETE dm FROM sys_department_menu dm JOIN sys_menu m ON m.id = dm.menu_id
-- WHERE dm.dept_id = 5
--   AND m.menu_key IN ('rdm-dashboard-project', 'employee-management', 'org-structure');
-- ============================================================================

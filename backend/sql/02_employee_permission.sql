-- ============================================================
-- MFTB 搜广推系统 - 集团员工与功能权限落库
-- 在 01_init_system.sql 基础上执行
-- ============================================================

-- sys_user 增加功能角色绑定字段 (JSON 数组, 存 sys_role.id, 如 [1,3])
ALTER TABLE sys_user
    ADD COLUMN function_roles TEXT NULL COMMENT '绑定的功能角色ID JSON数组' AFTER role;

-- sys_role 增加菜单权限字段 (JSON 数组, 结构: [{"menuKey":"xxx","actions":["view","edit"]}])
ALTER TABLE sys_role
    ADD COLUMN permissions TEXT NULL COMMENT '菜单权限 JSON数组' AFTER description;

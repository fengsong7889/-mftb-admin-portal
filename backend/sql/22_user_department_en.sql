-- 用户表新增部门英文名称快照字段
ALTER TABLE sys_user ADD COLUMN department_en VARCHAR(100) DEFAULT NULL COMMENT '所在部门英文名称快照' AFTER department;

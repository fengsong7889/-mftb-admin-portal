-- 部门表新增英文名称字段
ALTER TABLE sys_department ADD COLUMN name_en VARCHAR(100) DEFAULT NULL COMMENT '部门英文名称' AFTER name;

-- 191: 员工详情 sys_user 补 gender / mobile / email 三列
-- 背景：前端「基础信息」提交性别、手机号、邮箱，但后端实体/保存/返回此前未处理，导致看似保存实则丢失。
-- 说明：本文件为一次性参考文档；实际幂等迁移由 EmployeeDetailDataInitializer 的
--       applyOnce("employee:contact-fields-v1", addColumns, verifyColumns) 负责（先查 information_schema 再 ALTER）。
-- MySQL 8.x：不支持 ADD COLUMN IF NOT EXISTS，故幂等判断放在 Java 侧。生产仅允许 ADD，不做破坏性操作。

ALTER TABLE sys_user ADD COLUMN gender VARCHAR(10)  DEFAULT NULL COMMENT '性别';
ALTER TABLE sys_user ADD COLUMN mobile VARCHAR(32)  DEFAULT NULL COMMENT '手机号';
ALTER TABLE sys_user ADD COLUMN email  VARCHAR(128) DEFAULT NULL COMMENT '邮箱';

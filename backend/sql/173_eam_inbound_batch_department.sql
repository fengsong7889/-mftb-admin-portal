-- 173: 验收入库批次添加管理部门字段
-- 存放仓库已存在于明细级别(biz_eam_inbound_batch_item.location_id)
-- 管理部门为批次级别（同批次统一）

ALTER TABLE biz_eam_inbound_batch
    ADD COLUMN department_id BIGINT NULL COMMENT '管理部門 ID (sys_dept.id)' AFTER operator,
    ADD COLUMN department_name VARCHAR(128) NULL COMMENT '管理部門名稱快照' AFTER department_id;

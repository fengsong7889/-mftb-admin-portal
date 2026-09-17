-- 158: 交接单增加「接收人类型」字段（employee=员工 / department=部门）
ALTER TABLE biz_eam_handover
    ADD COLUMN receiver_type VARCHAR(20) NOT NULL DEFAULT 'employee' COMMENT '接收人类型：employee=员工 / department=部门'
    AFTER to_department;

-- 历史数据默认 employee
UPDATE biz_eam_handover SET receiver_type = 'employee' WHERE receiver_type IS NULL;

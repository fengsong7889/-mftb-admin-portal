-- 调拨单补充原使用人工号字段
-- 旧记录为 NULL（展示时仅显示姓名），新调拨会填入 fromUserEmpId
ALTER TABLE biz_eam_transfer ADD COLUMN from_user_emp_id VARCHAR(50) DEFAULT NULL COMMENT '原使用人工号';

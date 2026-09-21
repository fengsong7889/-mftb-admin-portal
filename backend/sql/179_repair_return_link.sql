-- 179: 维修记录表增加 return_id 列 + 归还记录表增加 repair_id 列
-- 支持归还处置「申请维修」→ 维修管理菜单自动流转

-- biz_eam_repair 增加 return_id（关联归还记录 ID）
ALTER TABLE biz_eam_repair ADD COLUMN return_id BIGINT NULL COMMENT '关联归还记录 ID' AFTER cause_type;
ALTER TABLE biz_eam_repair ADD INDEX idx_return_id (return_id);

-- biz_eam_return 增加 repair_id（关联维修记录 ID）
ALTER TABLE biz_eam_return ADD COLUMN repair_id BIGINT NULL COMMENT '关联维修记录 ID' AFTER compensation_id;
